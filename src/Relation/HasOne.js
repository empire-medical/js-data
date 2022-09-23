import utils from '../utils'
import { Relation } from '../Relation'

export const hasOneType = 'hasOne'

export const HasOneRelation = Relation.extend({
  findExistingLinksFor (relatedMapper, record) {
    const recordId = utils.get(record, relatedMapper.idAttribute)
    const records = this.findExistingLinksByForeignKey(recordId)

    if (records && records.length) {
      return records[0]
    }
  },

  isRequiresChildId () {
    return true
  }
}, {
  TYPE_NAME: hasOneType,
  requiresValidForeignKey: true
})

export function createDescriptor (mapper, def, name, store) {
  const relation = def.relation
  const foreignKey = def.foreignKey
  const localField = def.localField
  const path = `links.${localField}`
  const updateOpts = { index: foreignKey }

  // TODO: Handle case when belongsTo relation isn't ever defined
  if (store._collections[relation] && foreignKey && !store.getCollection(relation).indexes[foreignKey]) {
    store.getCollection(relation).createIndex(foreignKey)
  }

  // descriptor
  return {
    // e.g. user.profile = someProfile
    set (record) {
      const current = this._get(path)
      if (record === current) {
        return current
      }
      const inverseLocalField = def.getInverse(mapper).localField
      // Update (unset) inverse relation
      if (current) {
        utils.safeSetProp(current, foreignKey, undefined)
        store.getCollection(relation).updateIndex(current, updateOpts)
        utils.safeSetLink(current, inverseLocalField, undefined)
      }
      if (record) {
        const relatedId = utils.get(record, def.getRelation().idAttribute)
        // Prefer store record
        if (relatedId !== undefined) {
          record = store.get(relation, relatedId) || record
        }

        // Set locals
        utils.safeSetLink(this, localField, record)

        // Update (set) inverse relation
        utils.safeSetProp(record, foreignKey, utils.get(this, mapper.idAttribute))
        store.getCollection(relation).updateIndex(record, updateOpts)
        utils.safeSetLink(record, inverseLocalField, this)
      } else {
        // Unset locals
        utils.safeSetLink(this, localField, undefined)
      }
      return record
    }
  }
}
