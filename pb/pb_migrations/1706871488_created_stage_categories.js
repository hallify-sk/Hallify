/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "hgj9brjypc8a3h3",
    "created": "2024-02-02 10:58:08.835Z",
    "updated": "2024-02-02 10:58:08.835Z",
    "name": "stage_categories",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "klflcax7",
        "name": "name",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
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
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("hgj9brjypc8a3h3");

  return dao.deleteCollection(collection);
})
