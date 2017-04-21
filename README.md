# Object packer

a helpers for pack and unpack JS-objects to/from base64-string.

## Installation

~~~
npm install --save object-packer
~~~

## Usage

### Packing/unpacking
~~~ javascript
import { packable, pack, unpack } from 'object-packer';

class TestClass {
    @packable.flag
    flagField = false;

    @packable.integer(999) // specify max value
    uintField = 0;

    constructor(a = false, b = 0) {
        this.flagField = a;
        this.uintField = b;
    }

    dump() {
        return {
            flagField: this.flagField,
            uintField: this.uintField,
        }
    }
}

pack(new TestClass()); // ["AMiM", {}]
pack(new TestClass(true, 0)); // ["AciM", {}]
pack(new TestClass(false, 42)); // ["VciM", {}]
pack(new TestClass(true, 42)); // ["VMiM", {}]

unpack(TestClass, 'VMiM', {}).dump(); // { flagField: false, uintField: 42 }
~~~

Out-of-the-box it contains decorators just for flags and unsigned integers, but you can define your own packer:

~~~ javascript

const customPacker = {
    reader(instance, index) {
        if (index === 0) return null;
        return instance.collection[index - 1];
    },

    writer(instance, value) {
        return instance.collection.indexOf(value) + 1;
    },
};

class TestClass {
    @packable.custom(4, customPacker)
    itemFromCollection = null;

    collection = ['foo', 'bar'];

    constructor(value) {
        this.itemFromCollection = value;
    }
}

pack(new TestClass()); // ["kBm5", {}]
pack(new TestClass('foo')); // ["kRm5", {}]
pack(new TestClass('bar')); // ["khm5", {}]
~~~

By default `pack` doesn't check unpacked object and it can be unequal to the original.

~~~ javascript

class AnotherClass {
    @packable.custom(4, customPacker)
    itemFromCollection = null;

    collection = ['new item', 'foo', 'bar'];
}

unpack(AnotherClass, 'kRm5', {}).itemFromCollection // 'new item'
~~~

For preventing these situations you can specify a function with will be used for signing base64-string:

~~~ javascript

@packable(obj => ({ item: obj.itemFromCollection }))
class TestClass {
    @packable.custom(4, customPacker)
    itemFromCollection = 'foo'; // first element from collection

    collection = ['foo', 'bar'];
}

@packable(obj => ({ item: obj.itemFromCollection }))
class AnotherClass {
    @packable.custom(4, customPacker)
    itemFromCollection = 'new item'; // also first element from collection

    collection = ['new item', 'foo', 'bar'];
}

pack(new TestClass()); // ["Qfqy", {}]
pack(new AnotherClass()); // ["YRDP", {}]
~~~

You can also mark some fields as an `external` and they would be extracted to separete object.

~~~ javascript

class TestClass {
    @packable.external
    name = null;

    constructor(name) {
        this.name = name;
    }
}

pack(new TestClass('long string')); // ["mZFL", {"name": "long string"}]
unpack(TestClass, 'mZFL', {'name': 'long string'}).name; // "long string"
~~~

### Change tracking

~~~ javascript

import { packable, track } from 'object-packer';

class TestClass {
    @packable.flag
    flag = false;

    @packable.external
    name = 'string'
}

const onChange = (packedConfig, externalFields) => {
    $state.go('server.configurator', {
    	...externalFields,
        config: packedConfig,
    }, { inherit: true, notify: false, location: 'replace' });
};


const instance = new TestClass();
instance::track(onChange);

instance.flag = true; // onChange will be fired here with arguments 'MiOX' and {name: 'string'}
instance.name = 'new name'; // and fired again with 'MiOX' and {name: 'new name'}
~~~