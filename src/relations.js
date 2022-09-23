import { Relation } from './Relation'
import { BelongsToRelation, belongsToType } from './Relation/BelongsTo'
import { HasManyRelation, hasManyType } from './Relation/HasMany'
import { HasOneRelation, hasOneType } from './Relation/HasOne'

[BelongsToRelation, HasManyRelation, HasOneRelation].forEach(RelationType => {
  Relation[RelationType.TYPE_NAME] = (related, options) => new RelationType(related, options)
})

export { belongsToType, hasManyType, hasOneType, Relation }
