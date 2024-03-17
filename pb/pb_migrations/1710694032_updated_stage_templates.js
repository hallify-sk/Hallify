/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ry5jmohe",
    "name": "tables",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // remove
  collection.schema.removeField("ry5jmohe")

  return dao.saveCollection(collection)
})
