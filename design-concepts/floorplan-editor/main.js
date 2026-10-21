import { mount } from 'svelte';
import Review from './Review.svelte';
import '../../src/app.css';
import './review.css';
mount(Review, { target: document.getElementById('review') });
