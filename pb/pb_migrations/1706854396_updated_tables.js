/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_lpuFYgy` ON `tables` (`stageReferenceName`)"
  ]

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  collection.indexes = []

  return dao.saveCollection(collection)
})
