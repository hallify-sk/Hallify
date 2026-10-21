# Audited snapshot

These two files were copied from commit `6a6934f5a0c4a1ac45412b776c7e13670d958536`. At the start of this review they matched the working-tree editor and floorplan types. Concurrent work later changed both production files, so this snapshot keeps the design comparison stable.

`MapEditor.svelte` differs from that commit only in its two floorplan-types imports, which point at the local snapshot. Translations still use the application's locale module. No editor behavior was rewritten in this snapshot.

The snapshot is review material. Do not merge it back into production or maintain a second editor implementation. A selected concept should be integrated with the latest engine using typed commands and state.
