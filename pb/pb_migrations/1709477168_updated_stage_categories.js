/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = [
    "CREATE INDEX `idx_F2HumLT` ON `stage_categories` (`name`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = []

  return dao.saveCollection(collection)
})
