/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = [
    "CREATE INDEX `idx_MVqWO3i` ON `stage_categories` (`internalName`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = []

  return dao.saveCollection(collection)
})
