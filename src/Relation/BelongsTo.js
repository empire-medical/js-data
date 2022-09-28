import utils from '../utils'
import { hasManyType } from './HasMany'
import { hasOneType } from './HasOne'
import { Relation } from '../Relation'

export const belongsToType = 'belongsTo'

export const BelongsToRelation = Relation.extend({
  getForeignKey (record) {
    return utils.get(record, this.foreignKey)
  },

  _setForeignKey (record, relatedRecord) {
    utils.set(record, this.foreignKey, utils.get(relatedRecord, this.getRelation().idAttribute))
  },

  findExistingLinksFor (record) {
    if (!record) {
      return
    }
    const relatedId = utils.get(record, this.foreignKey)
    if (relatedId !== undefined && relatedId !== null) {
      return this.relatedCollection.get(relatedId)
    }
  },

  isRequiresParentId () {
    return true
  },

  isRequiresValidForeignKey () {
    return true
  },

  createParentRecord (props, opts) {
    const relationData = this.getLocalField(props)

    return this.createLinked(relationData, opts).then((record) => {
      this.setForeignKey(props, record)
    })
  },

  createChildRecord () {
    throw new Error('"BelongsTo" relation does not support child creation as it cannot have children.')
  }
}, {
  TYPE_NAME: belongsToType
})

export function createDescriptor (mapper, def, name, store) {
  const idAttribute = mapper.idAttribute
  // todo: fix this
  const collection = store.getCollection(name)
  const relation = def.relation
  const foreignKey = def.foreignKey
  const localField = def.localField
  const path = `links.${localField}`
  const updateOpts = { index: foreignKey }

  if (!collection.indexes[foreignKey]) {
    collection.createIndex(foreignKey)
  }

  const descriptor = {
    // e.g. profile.user = someUser
    // or comment.post = somePost
    set (record) {
      // e.g. const otherUser = profile.user
      const currentParent = this._get(path)
      // e.g. profile.user === someUser
      if (record === currentParent) {
        return currentParent
      }
      const id = utils.get(this, idAttribute)
      const inverseDef = def.getInverse(mapper)

      // e.g. profile.user !== someUser
      // or comment.post !== somePost
      if (currentParent && inverseDef) {
        this.removeInverseRelation(currentParent, id, inverseDef, idAttribute)
      }
      if (record) {
        // e.g. profile.user = someUser
        const relatedIdAttribute = def.getRelation().idAttribute
        const relatedId = utils.get(record, relatedIdAttribute)

        // Prefer store record
        if (relatedId !== undefined && this._get('$')) {
          record = store.get(relation, relatedId) || record
        }

        // Set locals
        // e.g. profile.user = someUser
        // or comment.post = somePost
        utils.safeSetLink(this, localField, record)
        utils.safeSetProp(this, foreignKey, relatedId)
        collection.updateIndex(this, updateOpts)

        if (inverseDef) {
          this.setupInverseRelation(record, id, inverseDef, idAttribute)
        }
      } else {
        // Unset in-memory link only
        // e.g. profile.user = undefined
        // or comment.post = undefined
        utils.safeSetLink(this, localField, undefined)
      }
      return record
    }
  }

  let foreignKeyDescriptor = Object.getOwnPropertyDescriptor(mapper.recordClass.prototype, foreignKey)
  if (!foreignKeyDescriptor) {
    foreignKeyDescriptor = {
      enumerable: true
    }
  }
  const originalGet = foreignKeyDescriptor.get
  foreignKeyDescriptor.get = function () {
    if (originalGet) {
      return originalGet.call(this)
    }
    return this._get(`props.${foreignKey}`)
  }
  const originalSet = foreignKeyDescriptor.set
  foreignKeyDescriptor.set = function (value) {
    if (originalSet) {
      originalSet.call(this, value)
    }
    const currentParent = utils.get(this, localField)
    const id = utils.get(this, idAttribute)
    const inverseDef = def.getInverse(mapper)
    const currentParentId = currentParent ? utils.get(currentParent, def.getRelation().idAttribute) : undefined

    if (inverseDef && currentParent && currentParentId !== undefined && currentParentId !== value) {
      if (inverseDef.type === hasOneType) {
        utils.safeSetLink(currentParent, inverseDef.localField, undefined)
      } else if (inverseDef.type === hasManyType) {
        const children = utils.get(currentParent, inverseDef.localField)
        if (id === undefined) {
          utils.remove(children, (child) => child === this)
        } else {
          utils.remove(children, (child) => child === this || id === utils.get(child, idAttribute))
        }
      }
    }

    utils.safeSetProp(this, foreignKey, value)
    collection.updateIndex(this, updateOpts)

    if ((value === undefined || value === null)) {
      if (currentParentId !== undefined) {
        // Unset locals
        utils.set(this, localField, undefined)
      }
    } else if (this._get('$')) {
      const storeRecord = store.get(relation, value)
      if (storeRecord) {
        utils.set(this, localField, storeRecord)
      }
    }
  }
  Object.defineProperty(mapper.recordClass.prototype, foreignKey, foreignKeyDescriptor)

  return descriptor
}
