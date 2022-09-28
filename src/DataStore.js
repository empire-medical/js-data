import utils from './utils'
import { createDescriptor as createBelongsToDescriptor, BelongsToRelation, belongsToType } from './Relation/BelongsTo'
import { createDescriptor as createHasManyDescriptor, HasManyRelation, hasManyType } from './Relation/HasMany'
import { createDescriptor as createHasOneDescriptor, HasOneRelation, hasOneType } from './Relation/HasOne'
import SimpleStore from './SimpleStore'
import LinkedCollection from './LinkedCollection'

const DATASTORE_DEFAULTS = {
  /**
   * Whether in-memory relations should be unlinked from records after they are
   * destroyed.
   *
   * @default true
   * @name DataStore#unlinkOnDestroy
   * @since 3.0.0
   * @type {boolean}
   */
  unlinkOnDestroy: true
}

/**
 * The `DataStore` class is an extension of {@link SimpleStore}. Not only does
 * `DataStore` manage mappers and store data in collections, it uses the
 * {@link LinkedCollection} class to link related records together in memory.
 *
 * ```javascript
 * import { DataStore } from 'js-data';
 * ```
 *
 * @example
 * import { DataStore } from 'js-data';
 * import HttpAdapter from 'js-data-http';
 * const store = new DataStore();
 *
 * // DataStore#defineMapper returns a direct reference to the newly created
 * // Mapper.
 * const UserMapper = store.defineMapper('user');
 *
 * // DataStore#as returns the store scoped to a particular Mapper.
 * const UserStore = store.as('user');
 *
 * // Call "find" on "UserMapper" (Stateless ORM)
 * UserMapper.find(1).then((user) => {
 *   // retrieved a "user" record via the http adapter, but that's it
 *
 *   // Call "find" on "store" targeting "user" (Stateful DataStore)
 *   return store.find('user', 1); // same as "UserStore.find(1)"
 * }).then((user) => {
 *   // not only was a "user" record retrieved, but it was added to the
 *   // store's "user" collection
 *   const cachedUser = store.getCollection('user').get(1);
 *   console.log(user === cachedUser); // true
 * });
 *
 * @class DataStore
 * @extends SimpleStore
 * @param {object} [opts] Configuration options. See {@link SimpleStore}.
 * @param {boolean} [opts.collectionClass={@link LinkedCollection}] See {@link DataStore#collectionClass}.
 * @param {boolean} [opts.debug=false] See {@link Component#debug}.
 * @param {boolean} [opts.unlinkOnDestroy=true] See {@link DataStore#unlinkOnDestroy}.
 * @param {boolean|Function} [opts.usePendingFind=true] See {@link DataStore#usePendingFind}.
 * @param {boolean|Function} [opts.usePendingFindAll=true] See {@link DataStore#usePendingFindAll}.
 * @returns {DataStore}
 * @see SimpleStore
 * @since 3.0.0
 * @tutorial ["http://www.js-data.io/v3.0/docs/components-of-jsdata#datastore","Components of JSData: DataStore"]
 * @tutorial ["http://www.js-data.io/v3.0/docs/working-with-the-datastore","Working with the DataStore"]
 * @tutorial ["http://www.js-data.io/v3.0/docs/jsdata-and-the-browser","Notes on using JSData in the Browser"]
 */
function DataStore (opts) {
  utils.classCallCheck(this, DataStore)

  opts || (opts = {})
  // Fill in any missing options with the defaults
  utils.fillIn(opts, DATASTORE_DEFAULTS)
  opts.collectionClass || (opts.collectionClass = LinkedCollection)

  this.relationshipTypes || (this.relationshipTypes = {})
  this.registerRelationshipType(belongsToType, BelongsToRelation, createBelongsToDescriptor)
  this.registerRelationshipType(hasManyType, HasManyRelation, createHasManyDescriptor)
  this.registerRelationshipType(hasOneType, HasOneRelation, createHasOneDescriptor)

  SimpleStore.call(this, opts)
}

const props = {
  constructor: DataStore,

  defineMapper (name, opts) {
    // This is likely only needed for tests since they don't pass in any opts.
    opts || (opts = {})

    // Complexity of this method is beyond simply using => functions to bind context
    const self = this

    // Set the relationship types so that instantiator functions can be bound
    // to the mapper inside its constructor.
    opts._relationshipTypes || (opts._relationshipTypes = this.relationshipTypes)

    const mapper = SimpleStore.prototype.defineMapper.call(self, name, opts)
    mapper.relationList.forEach(function (def) {
      const localField = def.localField
      const path = `links.${localField}`
      const getter = function () { return this._get(path) }

      let descriptor

      if (Object.prototype.hasOwnProperty.call(self.relationshipTypes, def.type)) {
        descriptor = self.relationshipTypes[def.type].createDescriptor(mapper, def, name, self)
      }

      if (descriptor) {
        if (!Object.prototype.hasOwnProperty.call(descriptor, 'get')) {
          descriptor.get = getter
        }

        descriptor.enumerable = def.enumerable === undefined ? false : def.enumerable
        if (def.get) {
          const origGet = descriptor.get
          descriptor.get = function () {
            return def.get(def, this, (...args) => origGet.apply(this, args))
          }
        }
        if (def.set) {
          const origSet = descriptor.set
          descriptor.set = function (related) {
            return def.set(def, this, related, (value) => origSet.call(this, value === undefined ? related : value))
          }
        }
        Object.defineProperty(mapper.recordClass.prototype, def.localField, descriptor)
      }
    })

    return mapper
  },

  destroy (name, id, opts) {
    opts || (opts = {})
    return SimpleStore.prototype.destroy.call(this, name, id, opts).then((result) => {
      let record
      if (opts.raw) {
        record = result.data
      } else {
        record = result
      }

      if (record && this.unlinkOnDestroy) {
        const _opts = utils.plainCopy(opts)
        _opts.withAll = true
        utils.forEachRelation(this.getMapper(name), _opts, (def) => {
          utils.set(record, def.localField, undefined)
        })
      }
      return result
    })
  },

  destroyAll (name, query, opts) {
    opts || (opts = {})
    return SimpleStore.prototype.destroyAll.call(this, name, query, opts).then((result) => {
      let records
      if (opts.raw) {
        records = result.data
      } else {
        records = result
      }

      if (records && records.length && this.unlinkOnDestroy) {
        const _opts = utils.plainCopy(opts)
        _opts.withAll = true
        utils.forEachRelation(this.getMapper(name), _opts, (def) => {
          records.forEach((record) => {
            utils.set(record, def.localField, undefined)
          })
        })
      }
      return result
    })
  },

  registerRelationshipType (type, relationshipClass, descriptor) {
    this.relationshipTypes[type] = { RelationshipClass: relationshipClass, createDescriptor: descriptor }
  }
}

export default SimpleStore.extend(props)

/**
 * Create a subclass of this DataStore:
 * @example <caption>DataStore.extend</caption>
 * const JSData = require('js-data');
 * const { DataStore } = JSData;
 * console.log('Using JSData v' + JSData.version.full);
 *
 * // Extend the class using ES2015 class syntax.
 * class CustomDataStoreClass extends DataStore {
 *   foo () { return 'bar'; }
 *   static beep () { return 'boop'; }
 * }
 * const customDataStore = new CustomDataStoreClass();
 * console.log(customDataStore.foo());
 * console.log(CustomDataStoreClass.beep());
 *
 * // Extend the class using alternate method.
 * const OtherDataStoreClass = DataStore.extend({
 *   foo () { return 'bar'; }
 * }, {
 *   beep () { return 'boop'; }
 * });
 * const otherDataStore = new OtherDataStoreClass();
 * console.log(otherDataStore.foo());
 * console.log(OtherDataStoreClass.beep());
 *
 * // Extend the class, providing a custom constructor.
 * function AnotherDataStoreClass () {
 *   DataStore.call(this);
 *   this.created_at = new Date().getTime();
 * }
 * DataStore.extend({
 *   constructor: AnotherDataStoreClass,
 *   foo () { return 'bar'; }
 * }, {
 *   beep () { return 'boop'; }
 * });
 * const anotherDataStore = new AnotherDataStoreClass();
 * console.log(anotherDataStore.created_at);
 * console.log(anotherDataStore.foo());
 * console.log(AnotherDataStoreClass.beep());
 *
 * @method DataStore.extend
 * @param {object} [props={}] Properties to add to the prototype of the
 * subclass.
 * @param {object} [props.constructor] Provide a custom constructor function
 * to be used as the subclass itself.
 * @param {object} [classProps={}] Static properties to add to the subclass.
 * @returns {Constructor} Subclass of this DataStore class.
 * @since 3.0.0
 */
