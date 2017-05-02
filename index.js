import { BitStream } from 'bit-buffer';
import { decode, encode } from 'base64-arraybuffer';
import md5 from 'js-md5';
import invariant from 'invariant';

const getKey = name => (typeof Symbol === 'function' ? Symbol(name) : `OBJECT_PACKER__${name.toUpperCase()}`);

const SETTINGS_KEY = getKey('settings');
const ON_UPDATE_KEY = getKey('onUpdate');
const ON_ERROR_KEY = getKey('onError');

function getSettings() {
    if (!this[SETTINGS_KEY]) {
        this[SETTINGS_KEY] = {
            external: [],
            packers: [],
            dumpFn: () => ({}),
        };
    }

    return this[SETTINGS_KEY];
}

export function packable(dumpFn) {
    return (Cls) => {
        const settings = Cls::getSettings();
        settings.dumpFn = dumpFn;
    };
}

function getPackedDataSize(Cls) {
    const settings = Cls::getSettings();
    const dataSize = settings.packers.reduce((sum, [size]) => sum + size, 0);

    let bufferSize = Math.ceil(dataSize / 8);
    if (bufferSize % 3 !== 0) {
        // must be a multiple of three
        bufferSize += 3 - (bufferSize % 3);
    }

    const hashSize = (bufferSize * 8) - dataSize;
    if (hashSize < 4) {
        // hash size must be at least 4 bits
        return [bufferSize + 3, hashSize + (8 * 3)];
    }

    return [bufferSize, hashSize];
}

export function pack(instance) {
    const Cls = instance.constructor;
    const [bufferSize, hashSize] = getPackedDataSize(Cls);
    const buffer = new ArrayBuffer(bufferSize);
    const stream = new BitStream(buffer);

    const settings = Cls::getSettings();
    settings.packers.forEach(([size, field, { writer }]) => {
        const value = writer(instance, instance[field]);
        invariant(value >= 0, `${field}'s value should be unsigned.`);
        invariant(value < (2 ** size), `${value} is too big for ${field}. It should be less than ${2 ** size}.`);
        stream.writeBits(value, size);
    });

    const external = settings.external.reduce((res, key) => Object.assign(res, { [key]: instance[key] }), {});

    // calculate hash
    const json = JSON.stringify(settings.dumpFn(instance));
    const hash = md5.arrayBuffer(json);
    const hashStream = new BitStream(hash);
    const hashNumber = hashStream.readBits(hashSize, false);

    // add first hashSize-bits to end of stream
    stream.writeBits(hashNumber, hashSize);

    return [encode(buffer), external];
}

export function unpack(Cls, packed, props, constructorArgs = []) {
    const instance = new Cls(...constructorArgs);
    Object.assign(instance, props);

    if (!packed) {
        return instance;
    }

    const [bufferSize, hashSize] = getPackedDataSize(Cls);
    const buffer = decode(packed);
    if (bufferSize !== buffer.byteLength) {
        // unexpected buffer size
        return null;
    }

    const stream = new BitStream(buffer, 0, bufferSize);

    const settings = Cls::getSettings();
    settings.packers.forEach(([size, field, { reader }]) => {
        instance[field] = reader(instance, stream.readBits(size, false));
    });

    if (stream.bitsLeft !== hashSize) {
        // stream contains unexpected count of bits
        return null;
    }

    // compare hash number from params with calculated value
    const hashNumber = stream.readBits(hashSize, false);
    const json = JSON.stringify(settings.dumpFn(instance));
    const hash = md5.arrayBuffer(json);
    const hashStream = new BitStream(hash);
    if (hashStream.readBits(hashSize, false) !== hashNumber) {
        // it's wrong configuration
        return null;
    }

    return instance;
}

function createDefaultField(descriptor) {
    let currentValue = descriptor.initializer();

    return {
        set(value) {
            currentValue = value;

            if (this[ON_UPDATE_KEY]) {
                if (this[ON_ERROR_KEY]) {
                    try {
                        const packed = pack(this);
                        this[ON_UPDATE_KEY](...packed);
                    } catch (ex) {
                        this[ON_ERROR_KEY](ex);
                    }
                } else {
                    this[ON_UPDATE_KEY](...pack(this));
                }
            }
        },
        get() {
            return currentValue;
        }
    };
}

packable.custom = (size, mappers) => (target, key, descriptor) => {
    target.constructor::getSettings().packers.push([size, key, mappers]);
    return createDefaultField(descriptor);
};

packable.flag = packable.custom(1, {
    reader(instance, value) {
        return value === 1;
    },

    writer(instance, value) {
        return value ? 1 : 0;
    },
});

packable.integer = maxValue => packable.custom(Math.ceil(Math.log2(maxValue + 1)), {
    reader(instance, value) {
        return value;
    },

    writer(instance, value) {
        return value;
    },
});

packable.external = (target, key, descriptor) => {
    target.constructor::getSettings().external.push([key]);
    return createDefaultField(descriptor);
};

export function track(callback, onError) {
    this[ON_UPDATE_KEY] = callback;
    if (onError) {
        this[ON_ERROR_KEY] = onError;
    }
}
