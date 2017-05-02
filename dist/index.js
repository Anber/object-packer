(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(['exports', 'bit-buffer', 'base64-arraybuffer', 'js-md5', 'invariant'], factory);
    } else if (typeof exports !== "undefined") {
        factory(exports, require('bit-buffer'), require('base64-arraybuffer'), require('js-md5'), require('invariant'));
    } else {
        var mod = {
            exports: {}
        };
        factory(mod.exports, global.bitBuffer, global.base64Arraybuffer, global.jsMd5, global.invariant);
        global.index = mod.exports;
    }
})(this, function (exports, _bitBuffer, _base64Arraybuffer, _jsMd, _invariant) {
    'use strict';

    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    exports.packable = packable;
    exports.pack = pack;
    exports.unpack = unpack;
    exports.track = track;

    var _jsMd2 = _interopRequireDefault(_jsMd);

    var _invariant2 = _interopRequireDefault(_invariant);

    function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : {
            default: obj
        };
    }

    function _toConsumableArray(arr) {
        if (Array.isArray(arr)) {
            for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) {
                arr2[i] = arr[i];
            }

            return arr2;
        } else {
            return Array.from(arr);
        }
    }

    function _defineProperty(obj, key, value) {
        if (key in obj) {
            Object.defineProperty(obj, key, {
                value: value,
                enumerable: true,
                configurable: true,
                writable: true
            });
        } else {
            obj[key] = value;
        }

        return obj;
    }

    var _slicedToArray = function () {
        function sliceIterator(arr, i) {
            var _arr = [];
            var _n = true;
            var _d = false;
            var _e = undefined;

            try {
                for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
                    _arr.push(_s.value);

                    if (i && _arr.length === i) break;
                }
            } catch (err) {
                _d = true;
                _e = err;
            } finally {
                try {
                    if (!_n && _i["return"]) _i["return"]();
                } finally {
                    if (_d) throw _e;
                }
            }

            return _arr;
        }

        return function (arr, i) {
            if (Array.isArray(arr)) {
                return arr;
            } else if (Symbol.iterator in Object(arr)) {
                return sliceIterator(arr, i);
            } else {
                throw new TypeError("Invalid attempt to destructure non-iterable instance");
            }
        };
    }();

    var getKey = function getKey(name) {
        return typeof Symbol === 'function' ? Symbol(name) : 'OBJECT_PACKER__' + name.toUpperCase();
    };

    var SETTINGS_KEY = getKey('settings');
    var ON_UPDATE_KEY = getKey('onUpdate');
    var ON_ERROR_KEY = getKey('onError');

    function getSettings() {
        if (!this[SETTINGS_KEY]) {
            this[SETTINGS_KEY] = {
                external: [],
                packers: [],
                dumpFn: function dumpFn() {
                    return {};
                }
            };
        }

        return this[SETTINGS_KEY];
    }

    function packable(dumpFn) {
        return function (Cls) {
            var settings = getSettings.call(Cls);
            settings.dumpFn = dumpFn;
        };
    }

    function getPackedDataSize(Cls) {
        var settings = getSettings.call(Cls);
        var dataSize = settings.packers.reduce(function (sum, _ref) {
            var _ref2 = _slicedToArray(_ref, 1),
                size = _ref2[0];

            return sum + size;
        }, 0);

        var bufferSize = Math.ceil(dataSize / 8);
        if (bufferSize % 3 !== 0) {
            // must be a multiple of three
            bufferSize += 3 - bufferSize % 3;
        }

        var hashSize = bufferSize * 8 - dataSize;
        if (hashSize < 4) {
            // hash size must be at least 4 bits
            return [bufferSize + 3, hashSize + 8 * 3];
        }

        return [bufferSize, hashSize];
    }

    function pack(instance) {
        var Cls = instance.constructor;

        var _getPackedDataSize = getPackedDataSize(Cls),
            _getPackedDataSize2 = _slicedToArray(_getPackedDataSize, 2),
            bufferSize = _getPackedDataSize2[0],
            hashSize = _getPackedDataSize2[1];

        var buffer = new ArrayBuffer(bufferSize);
        var stream = new _bitBuffer.BitStream(buffer);

        var settings = getSettings.call(Cls);
        settings.packers.forEach(function (_ref3) {
            var _ref4 = _slicedToArray(_ref3, 3),
                size = _ref4[0],
                field = _ref4[1],
                writer = _ref4[2].writer;

            var value = writer(instance, instance[field]);
            (0, _invariant2.default)(value >= 0, field + '\'s value should be unsigned.');
            (0, _invariant2.default)(value < Math.pow(2, size), value + ' is too big for ' + field + '. It should be less than ' + Math.pow(2, size) + '.');
            stream.writeBits(value, size);
        });

        var external = settings.external.reduce(function (res, key) {
            return Object.assign(res, _defineProperty({}, key, instance[key]));
        }, {});

        // calculate hash
        var json = JSON.stringify(settings.dumpFn(instance));
        var hash = _jsMd2.default.arrayBuffer(json);
        var hashStream = new _bitBuffer.BitStream(hash);
        var hashNumber = hashStream.readBits(hashSize, false);

        // add first hashSize-bits to end of stream
        stream.writeBits(hashNumber, hashSize);

        return [(0, _base64Arraybuffer.encode)(buffer), external];
    }

    function unpack(Cls, packed, props) {
        var constructorArgs = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];

        var instance = new (Function.prototype.bind.apply(Cls, [null].concat(_toConsumableArray(constructorArgs))))();
        Object.assign(instance, props);

        if (!packed) {
            return instance;
        }

        var _getPackedDataSize3 = getPackedDataSize(Cls),
            _getPackedDataSize4 = _slicedToArray(_getPackedDataSize3, 2),
            bufferSize = _getPackedDataSize4[0],
            hashSize = _getPackedDataSize4[1];

        var buffer = (0, _base64Arraybuffer.decode)(packed);
        if (bufferSize !== buffer.byteLength) {
            // unexpected buffer size
            return null;
        }

        var stream = new _bitBuffer.BitStream(buffer, 0, bufferSize);

        var settings = getSettings.call(Cls);
        settings.packers.forEach(function (_ref5) {
            var _ref6 = _slicedToArray(_ref5, 3),
                size = _ref6[0],
                field = _ref6[1],
                reader = _ref6[2].reader;

            instance[field] = reader(instance, stream.readBits(size, false));
        });

        if (stream.bitsLeft !== hashSize) {
            // stream contains unexpected count of bits
            return null;
        }

        // compare hash number from params with calculated value
        var hashNumber = stream.readBits(hashSize, false);
        var json = JSON.stringify(settings.dumpFn(instance));
        var hash = _jsMd2.default.arrayBuffer(json);
        var hashStream = new _bitBuffer.BitStream(hash);
        if (hashStream.readBits(hashSize, false) !== hashNumber) {
            // it's wrong configuration
            return null;
        }

        return instance;
    }

    function createDefaultField(descriptor) {
        var currentValue = descriptor.initializer();

        return {
            set: function set(value) {
                currentValue = value;

                if (this[ON_UPDATE_KEY]) {
                    if (this[ON_ERROR_KEY]) {
                        try {
                            var packed = pack(this);
                            this[ON_UPDATE_KEY].apply(this, _toConsumableArray(packed));
                        } catch (ex) {
                            this[ON_ERROR_KEY](ex);
                        }
                    } else {
                        this[ON_UPDATE_KEY].apply(this, _toConsumableArray(pack(this)));
                    }
                }
            },
            get: function get() {
                return currentValue;
            }
        };
    }

    packable.custom = function (size, mappers) {
        return function (target, key, descriptor) {
            var _context;

            (_context = target.constructor, getSettings).call(_context).packers.push([size, key, mappers]);
            return createDefaultField(descriptor);
        };
    };

    packable.flag = packable.custom(1, {
        reader: function reader(instance, value) {
            return value === 1;
        },
        writer: function writer(instance, value) {
            return value ? 1 : 0;
        }
    });

    packable.integer = function (maxValue) {
        return packable.custom(Math.ceil(Math.log2(maxValue + 1)), {
            reader: function reader(instance, value) {
                return value;
            },
            writer: function writer(instance, value) {
                return value;
            }
        });
    };

    packable.external = function (target, key, descriptor) {
        var _context2;

        (_context2 = target.constructor, getSettings).call(_context2).external.push([key]);
        return createDefaultField(descriptor);
    };

    function track(callback, onError) {
        this[ON_UPDATE_KEY] = callback;
        if (onError) {
            this[ON_ERROR_KEY] = onError;
        }
    }
});