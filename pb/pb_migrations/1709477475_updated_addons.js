/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2wj14qwcyq8zgd3")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "yuxztxgz",
    "name": "hourly",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2wj14qwcyq8zgd3")

  // remove
  collection.schema.removeField("yuxztxgz")

  return dao.saveCollection(collection)
})
