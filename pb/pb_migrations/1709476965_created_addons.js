/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "2wj14qwcyq8zgd3",
    "created": "2024-03-03 14:42:45.187Z",
    "updated": "2024-03-03 14:42:45.187Z",
    "name": "addons",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "hhyieb2e",
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
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX `idx_xGVMaUO` ON `addons` (`name`)"
    ],
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
  const collection = dao.findCollectionByNameOrId("2wj14qwcyq8zgd3");

  return dao.deleteCollection(collection);
})
