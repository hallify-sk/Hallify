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
			Napíšte nám
		</div>
	</Button>
</div>

<Dialog bind:open>
	{#snippet header()}
		💬 Chat podpora
	{/snippet}
	
	<div class="flex flex-col h-[500px] w-[420px] bg-background-1 rounded shadow-lg border border-border-main">
		{#if !sessionId}
			<!-- Initial chat form -->
			<div class="p-4 border-b border-border-main">
				<p class="text-text-main text-sm mb-3">Ahoj! Ako vám môžeme pomôcť?</p>
			</div>
			<div class="flex-1 p-4">
				<form class="flex flex-col gap-4" on:submit|preventDefault={startChat}>
					<textarea 
						class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm resize-none" 
						bind:value={newMessage} 
						placeholder="Opíšte váš problém alebo otázku..."
						rows="4"
						required
					></textarea>
					<Button color="primary" type="submit">
						Začať chat
					</Button>
				</form>
			</div>
		{:else}
			<!-- Chat interface -->
			<div class="flex-1 overflow-y-auto p-4 space-y-4">
				{#each messages as msg}
					<div class="flex {msg.senderType === 'guest' || msg.senderType === 'user' ? 'justify-end' : 'justify-start'}">
						<div class="flex flex-col max-w-xs">
							<!-- Message Bubble -->
							<div class="px-4 py-3 rounded-lg text-sm {
								msg.senderType === 'guest' || msg.senderType === 'user'
									? 'bg-primary text-white rounded-br-sm' 
									: msg.senderType === 'admin'
									? 'bg-secondary text-white rounded-bl-sm'
									: 'bg-background-4 text-text-main border border-border-main rounded-bl-sm'
							}">
								<div class="whitespace-pre-wrap">{msg.message}</div>
							</div>
							
							<!-- Message Meta with Author Info -->
							<div class="flex items-center gap-2 mt-1 px-1 {msg.senderType === 'guest' || msg.senderType === 'user' ? 'justify-end' : 'justify-start'}">
								{#if msg.senderType === 'admin'}
									<span class="text-xs text-blue-600 font-medium">ADMIN</span>
									{#if msg.senderFirstName && msg.senderLastName}
										<span class="text-xs text-text-2">•</span>
										<span class="text-xs text-text-2">{msg.senderFirstName} {msg.senderLastName}</span>
									{/if}
								{:else}
									<span class="text-xs text-text-2">
										{msg.senderType === 'user' ? 'Vy' : 'Vy'}
									</span>
								{/if}
								<span class="text-xs text-text-2">•</span>
								<span class="text-xs text-text-2">{formatTime(msg.createdAt)}</span>
							</div>
						</div>
					</div>
				{/each}
				
				{#if sessionStatus === 'closed'}
					<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
						<div class="text-yellow-800 text-sm font-medium mb-1">Chat ukončený</div>
						<div class="text-yellow-700 text-xs">Túto konverzáciu ukončil admin. Môžete odoslať novú správu a znovu ju otvoriť.</div>
					</div>
				{:else if messages.length === 0}
					<div class="text-center text-text-1 py-8">
						<p>Odošlite správu pre začatie konverzácie!</p>
					</div>
				{:else if messages.length > 0 && !messages.some(m => m.senderType === 'admin')}
					<div class="text-center text-text-1 py-4">
						<p class="text-xs">Admin vám čoskoro odpovie.</p>
					</div>
				{/if}
			</div>
			
			<div class="border-t border-border-main p-4">
				{#if sessionStatus === 'closed'}
					<div class="text-center text-text-1 text-xs mb-3">
						Odošlite správu pre znovuotvorenie konverzácie
					</div>
				{/if}
				<form class="flex gap-3" on:submit|preventDefault={sendMessage}>
					<input 
						class="flex-1 rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm" 
						bind:value={newMessage} 
						placeholder={sessionStatus === 'closed' ? 'Napíšte pre znovuotvorenie...' : 'Napíšte správu...'} 
					/>
					<Button color="primary" type="submit">
						{sessionStatus === 'closed' ? 'Otvoriť' : 'Odoslať'}
					</Button>
				</form>
			</div>
		{/if}
	</div>
</Dialog>
