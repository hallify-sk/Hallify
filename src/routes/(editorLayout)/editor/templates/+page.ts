export const load = ({ params, data }) => {
    return {
        reservation: data.reservation,
        addons: data.addons,
        slug: params.slug,
        categories: data.categories,
        templates: data.templates,
        apiUrl: data.apiUrl
    }
}