/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = []

  // remove
  collection.schema.removeField("ns11lmrf")

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3")

  collection.indexes = [
    "CREATE INDEX `idx_MVqWO3i` ON `stage_categories` (`internalName`)"
  ]

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ns11lmrf",
    "name": "internalName",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
})
