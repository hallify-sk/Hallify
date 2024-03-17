/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "4kbywa4n",
    "name": "chairCount",
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
  const collection = dao.findCollectionByNameOrId("5yw1wmo1kh08q5p")

  // remove
  collection.schema.removeField("4kbywa4n")

  return dao.saveCollection(collection)
})
