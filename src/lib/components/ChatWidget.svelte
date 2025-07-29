<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { page } from '$app/stores';
import Button from './Button.svelte';
import Dialog from './Dialog.svelte';
import Chat from '$lib/icons/Chat.svelte';
import Icon from '$lib/icons/Icon.svelte';

let open = false;
let sessionId: string | null = null;
let guestIdentifier = '';
let messages: any[] = [];
let sessionStatus: string = 'active';
let newMessage = '';
let polling: any;
let isConnected = false;

$: user = $page.data.user;

onMount(() => {
	if (typeof window !== 'undefined') {
		guestIdentifier = localStorage.getItem('chat_guest_id') || crypto.randomUUID();
		localStorage.setItem('chat_guest_id', guestIdentifier);
		
		// Check if we have an existing session
		const existingSessionId = localStorage.getItem('chat_session_id');
		if (existingSessionId) {
			sessionId = existingSessionId;
			// Validate the session exists by loading messages
			loadMessages().then(() => {
				if (sessionId) {
					startPolling();
				}
			});
		}

		// If user is signed in, link any existing guest chats
		if (user && guestIdentifier) {
			linkGuestChats();
		}
	}
});

onDestroy(() => {
	clearInterval(polling);
});

async function linkGuestChats() {
	try {
		await fetch('/api/chat/link-user', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guestIdentifier })
		});
	} catch (error) {
		console.error('Error linking guest chats:', error);
	}
}

async function startChat() {
	if (!newMessage.trim()) return;
	
	try {
		const res = await fetch('/api/chat/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				message: newMessage, 
				guestIdentifier,
				subject: 'New Chat Request'
			})
		});
		
		if (res.ok) {
			const data = await res.json();
			sessionId = data.sessionId;
			if (sessionId) {
				localStorage.setItem('chat_session_id', sessionId);
			}
			sessionStatus = 'active';
			newMessage = '';
			await loadMessages();
			startPolling();
			isConnected = true;
		}
	} catch (error) {
		console.error('Error starting chat:', error);
	}
}

async function sendMessage() {
	if (!sessionId || !newMessage.trim()) return;
	
	try {
		const res = await fetch('/api/chat/messages', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				sessionId, 
				message: newMessage, 
				senderType: user ? 'user' : 'guest'
			})
		});
		
		if (res.ok) {
			// If session was closed, sending a message reopens it
			if (sessionStatus === 'closed') {
				sessionStatus = 'active';
			}
			newMessage = '';
			await loadMessages();
		} else {
			const error = await res.json();
			if (res.status === 404) {
				// Session doesn't exist, clear localStorage and restart
				localStorage.removeItem('chat_session_id');
				sessionId = null;
				messages = [];
				sessionStatus = 'active';
				console.log('Session not found, cleared local storage');
			} else {
				console.error('Error sending message:', error);
			}
		}
	} catch (error) {
		console.error('Error sending message:', error);
	}
}

async function loadMessages() {
	if (!sessionId) return;
	
	try {
		const res = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
		if (res.ok) {
			const data = await res.json();
			messages = data.messages || data; // Handle both old and new response formats
			sessionStatus = data.sessionStatus || 'active';
		} else if (res.status === 404) {
			// Session doesn't exist, clear localStorage
			localStorage.removeItem('chat_session_id');
			sessionId = null;
			messages = [];
			sessionStatus = 'active';
			console.log('Session not found during load, cleared local storage');
		}
	} catch (error) {
		console.error('Error loading messages:', error);
	}
}

function startPolling() {
	clearInterval(polling);
	polling = setInterval(async () => {
		if (sessionId && open) {
			await loadMessages();
		}
	}, 3000);
}

function formatTime(dateString: string) {
	return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<!-- Floating Chat Button -->
<div class="fixed bottom-6 right-6 z-50">
	<Button color="primary" onclick={() => { open = true; if (sessionId) startPolling(); }}>
		<div class="flex items-center gap-2">
			<Icon scale="small">
				<Chat />
			</Icon>
			Chat with us
		</div>
	</Button>
</div>

<Dialog bind:open>
	{#snippet header()}
		💬 Chat Support
	{/snippet}
	
	<div class="flex flex-col h-96 w-80 bg-background-1 rounded shadow-lg border border-border-main">
		{#if !sessionId}
			<!-- Initial chat form -->
			<div class="p-4 border-b border-border-main">
				<p class="text-text-main text-sm mb-3">Hi! How can we help you today?</p>
			</div>
			<div class="flex-1 p-4">
				<form class="flex flex-col gap-3" on:submit|preventDefault={startChat}>
					<textarea 
						class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm resize-none" 
						bind:value={newMessage} 
						placeholder="Describe your question or issue..."
						rows="4"
						required
					></textarea>
					<Button color="primary" type="submit">
						Start Chat
					</Button>
				</form>
			</div>
		{:else}
			<!-- Chat interface -->
			<div class="flex-1 overflow-y-auto p-3 space-y-3">
				{#each messages as msg}
					<div class="flex {msg.senderType === 'guest' ? 'justify-end' : 'justify-start'}">
						<div class="px-3 py-2 rounded-lg max-w-xs text-sm {
							msg.senderType === 'guest' 
								? 'bg-primary text-white' 
								: msg.senderType === 'admin'
								? 'bg-secondary text-white'
								: 'bg-background-4 text-text-main border border-border-main'
						}">
							<div>{msg.message}</div>
							<div class="text-xs opacity-70 mt-1">{formatTime(msg.createdAt)}</div>
						</div>
					</div>
				{/each}
				
				{#if sessionStatus === 'closed'}
					<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
						<div class="text-yellow-800 text-sm font-medium mb-1">Chat Session Closed</div>
						<div class="text-yellow-700 text-xs">This conversation was closed by an admin. You can send a new message to reopen it.</div>
					</div>
				{:else if messages.length === 0}
					<div class="text-center text-text-1 py-8">
						<p>Send a message to start the conversation!</p>
					</div>
				{:else if messages.length > 0 && !messages.some(m => m.senderType === 'admin')}
					<div class="text-center text-text-1 py-4">
						<p class="text-xs">An admin will respond shortly.</p>
					</div>
				{/if}
			</div>
			
			<div class="border-t border-border-main p-3">
				{#if sessionStatus === 'closed'}
					<div class="text-center text-text-1 text-xs mb-2">
						Send a message to reopen this conversation
					</div>
				{/if}
				<form class="flex gap-2" on:submit|preventDefault={sendMessage}>
					<input 
						class="flex-1 rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm" 
						bind:value={newMessage} 
						placeholder={sessionStatus === 'closed' ? 'Type to reopen chat...' : 'Type your message...'} 
					/>
					<Button color="primary" type="submit">
						{sessionStatus === 'closed' ? 'Reopen' : 'Send'}
					</Button>
				</form>
			</div>
		{/if}
	</div>
</Dialog>
