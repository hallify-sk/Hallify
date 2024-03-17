export const load = ({ params, data }) => {
    return {
        stage: data.stage,
        slug: params.slug,
        stageCategories: data.stageCategories,
        tables: data.tables
    }
}