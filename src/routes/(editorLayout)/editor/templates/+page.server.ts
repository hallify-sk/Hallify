import PocketBase from 'pocketbase';

/**
 * Loads the initial data for the page.
 * @param locals The locals object containing PocketBase instance and apiUrl
 * @returns An object containing addons, categories, templates, and apiUrl
 */
export async function load({ locals }: { locals: any }) {
    return {
        addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
        categories: (
            await (locals.pb as PocketBase)
                .collection('stage_categories')
                .getFullList({ sort: 'created' })
        ).map((i: any) => {
            return { id: i.id, name: i.name };
        }),
        templates: await (locals.pb as PocketBase)
            .collection('stage_templates')
            .getFullList({ expand: 'categories' }),
        apiUrl: locals.pbApiURL
    };
}
