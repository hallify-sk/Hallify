/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "c2pw3mmi",
    "name": "render",
    "type": "file",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "mimeTypes": [],
      "thumbs": [],
      "maxSelect": 1,
      "maxSize": 5242880,
      "protected": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1tyx58slhet80bx")

  // remove
  collection.schema.removeField("c2pw3mmi")

  return dao.saveCollection(collection)
})
