/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pd6ygx3b",
    "name": "tags",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "2wj14qwcyq8zgd3",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": null,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // remove
  collection.schema.removeField("pd6ygx3b")

  return dao.saveCollection(collection)
})
