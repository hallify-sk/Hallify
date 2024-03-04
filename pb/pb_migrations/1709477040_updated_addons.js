/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2wj14qwcyq8zgd3")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "x876jj1e",
    "name": "price",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("2wj14qwcyq8zgd3")

  // remove
  collection.schema.removeField("x876jj1e")

  return dao.saveCollection(collection)
})
