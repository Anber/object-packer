import { packable, pack, unpack, track } from './index';

const customPacker = {
    reader(instance, index) {
        if (index === 0) return null;
        return instance.collection[index - 1];
    },

    writer(instance, value) {
        return instance.collection.indexOf(value) + 1;
    },
};

@packable(obj => obj.dump())
class TestClass {
    @packable.external
    a = null;

    @packable.flag
    b = false;

    @packable.integer(1000)
    i = 0;

    @packable.custom(4, customPacker)
    c = null;

    collection = ['foo', 'bar'];

    constructor(props) {
        Object.assign(this, props);
    }

    dump() {
        return {
            a: this.a,
            b: this.b,
            i: this.i,
            c: this.c,
        }
    }
}

const defaultData = {
    a: 'long text…',
    b: true,
    i: 42,
    c: null,
};

let instance;

beforeEach(() => {
    instance = new TestClass(defaultData);
});


test('should be properly initialized', () => {
    expect(instance.dump()).toEqual(defaultData);
});

test('default data', () => {
    const [base64, params] = pack(instance);
    expect(base64).toBeTruthy();
    expect(params).toEqual({
        a: defaultData.a,
    });

    const unpacked = unpack(TestClass, base64, params);
    expect(unpacked.dump()).toEqual(defaultData);
});

test('modified external value', () => {
    instance.a = 'test';
    const unpacked = unpack(TestClass, ...pack(instance));
    expect(unpacked.dump()).toEqual({
        ...defaultData,
        a: 'test',
    });
});

test('modified flag', () => {
    instance.b = false;
    const unpacked = unpack(TestClass, ...pack(instance));
    expect(unpacked.dump()).toEqual({
        ...defaultData,
        b: false,
    });
});

test('modified integer', () => {
    instance.i = 999;
    const unpacked = unpack(TestClass, ...pack(instance));
    expect(unpacked.dump()).toEqual({
        ...defaultData,
        i: 999,
    });
});

test('negative integer', () => {
    instance.i = -10;
    expect(() => pack(instance))
        .toThrow('i\'s value should be unsigned');
});

test('too big integer', () => {
    instance.i = 2048;
    expect(() => pack(instance))
        .toThrow('2048 is too big for i. It should be less than 1024.');
});

test('modified collection value', () => {
    instance.c = 'bar';
    const unpacked = unpack(TestClass, ...pack(instance));
    expect(unpacked.dump()).toEqual({
        ...defaultData,
        c: 'bar',
    });
});

test('broken hash', () => {
    instance.c = 'bar';
    const unpacked = unpack(TestClass, ...pack(instance), [{ collection: ['new', 'foo', 'bar'] }]);
    expect(unpacked).toBeNull();
});

test('tracker', () => {
    const onChange = jest.fn();
    instance::track(onChange);
    expect(onChange).not.toBeCalled();

    instance.a = 'test';
    expect(onChange).toHaveBeenLastCalledWith('VQBr', { a: 'test' });
    expect(onChange).toHaveBeenCalledTimes(1);

    instance.b = false;
    expect(onChange).toHaveBeenLastCalledWith('VIAj', { a: 'test' });
    expect(onChange).toHaveBeenCalledTimes(2);

    instance.i = 1000;
    expect(onChange).toHaveBeenLastCalledWith('0IcU', { a: 'test' });
    expect(onChange).toHaveBeenCalledTimes(3);

    instance.c = 'bar';
    expect(onChange).toHaveBeenLastCalledWith('0Jff', { a: 'test' });
    expect(onChange).toHaveBeenCalledTimes(4);

    const unpacked = unpack(TestClass, '0Jff', { a: 'test' });
    expect(unpacked.dump()).toEqual({
        a: 'test',
        b: false,
        i: 1000,
        c: 'bar',
    });
});

test('exception', () => {
    const onChange = jest.fn();
    const onError = jest.fn();
    instance::track(onChange, onError);
    expect(onChange).not.toBeCalled();
    expect(onError).not.toBeCalled();

    instance.i = undefined;
    expect(onChange).not.toBeCalled();
    expect(onError).toHaveBeenCalledTimes(1);
});
