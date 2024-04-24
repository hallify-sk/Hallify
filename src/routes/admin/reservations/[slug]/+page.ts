export const load = ({ params, data }) => {
    return {
        user: data.user,
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug,
        categories: data.categories,
        templates: data.templates
    }
}