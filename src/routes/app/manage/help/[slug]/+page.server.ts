import { error } from '@sveltejs/kit';
import { getArticle, ARTICLES } from '$lib/knowledgebase';
import { st } from '$lib/i18n-server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const article = getArticle(params.slug);
	if (!article) error(404, st(locals.locale).serverErrors.articleNotFound);

	// "More in this category" suggestions.
	const related = ARTICLES
		.filter((a) => a.category === article.category && a.slug !== article.slug)
		.map(({ slug, title }) => ({ slug, title }));

	return { article, related };
};
