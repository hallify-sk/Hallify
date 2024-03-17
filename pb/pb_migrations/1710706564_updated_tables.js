/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mekyqua9",
    "name": "isRound",
    "type": "bool",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {}
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("yg2u2arwhy2hoan")

  // remove
  collection.schema.removeField("mekyqua9")

  return dao.saveCollection(collection)
})
