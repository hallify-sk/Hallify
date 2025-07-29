<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { page } from '$app/stores';
import Button from './Button.svelte';
import Dialog from './Dialog.svelte';
import Chat from '$lib/icons/Chat.svelte';
import Cross from '$lib/icons/Cross.svelte';
import Icon from '$lib/icons/Icon.svelte';

let open = false;
let sessionId: string | null = null;
let guestIdentifier = '';
let messages: any[] = [];
let sessionStatus: string = 'active';
let newMessage = '';
let subject = '';
let polling: any;
let isConnected = false;
let chatStep: 'subject' | 'message' | 'chat' | 'closed-options' = 'subject';
let closedSessionId: string | null = null;
let isReopeningChat = false;
let closedByClient = false;

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
					chatStep = 'chat';
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
	if (!newMessage.trim() || !subject.trim()) return;
	
	try {
		const res = await fetch('/api/chat/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				message: newMessage, 
				guestIdentifier,
				subject: subject
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
			subject = '';
			chatStep = 'chat';
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
			// Reset the reopening flag since message was sent successfully
			isReopeningChat = false;
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
			
			// If session was closed, show closed options (unless user is actively reopening)
			if (sessionStatus === 'closed' && !isReopeningChat) {
				chatStep = 'closed-options';
				closedSessionId = sessionId;
			}
		} else if (res.status === 404) {
			// Session doesn't exist, clear localStorage
			localStorage.removeItem('chat_session_id');
			sessionId = null;
			messages = [];
			sessionStatus = 'active';
			chatStep = 'subject';
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

function proceedToMessage() {
	if (!subject.trim()) return;
	chatStep = 'message';
}

function startNewChat() {
	sessionId = null;
	closedSessionId = null;
	isReopeningChat = false;
	closedByClient = false;
	localStorage.removeItem('chat_session_id');
	messages = [];
	sessionStatus = 'active';
	chatStep = 'subject';
	subject = '';
	newMessage = '';
	clearInterval(polling);
}

async function reopenOldChat() {
	if (!closedSessionId) return;
	
	// Set flag to prevent polling from overriding the reopen attempt
	isReopeningChat = true;
	closedByClient = false;
	sessionId = closedSessionId;
	chatStep = 'chat';
	
	// Start polling for the reopened session
	startPolling();
}

async function closeChat() {
	if (!sessionId) return;
	
	try {
		const res = await fetch(`/api/chat/sessions/${sessionId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				status: 'closed',
				guestIdentifier: guestIdentifier
			})
		});
		
		if (res.ok) {
			sessionStatus = 'closed';
			chatStep = 'closed-options';
			closedByClient = true;
			clearInterval(polling);
		}
	} catch (error) {
		console.error('Error closing chat:', error);
	}
}
</script>

<!-- Floating Chat Button -->
<div class="fixed bottom-6 right-6 z-50">
	<Button color="primary" onclick={() => { 
		open = true; 
		if (sessionId && chatStep === 'chat') {
			startPolling(); 
		}
	}}>
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
		{#if chatStep === 'subject'}
			<!-- Subject input step -->
			<div class="p-4 border-b border-border-main">
				<p class="text-text-main text-sm mb-3">Ahoj! Aký je predmet vašej otázky?</p>
			</div>
			<div class="flex-1 p-4">
				<form class="flex flex-col gap-4" on:submit|preventDefault={proceedToMessage}>
					<input 
						type="text"
						class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm" 
						bind:value={subject} 
						placeholder="napr. Technická podpora, Otázka k objednávke..."
						required
					/>
					<Button color="primary" type="submit" disabled={!subject.trim()}>
						Pokračovať
					</Button>
				</form>
			</div>
		{:else if chatStep === 'message'}
			<!-- Message input step -->
			<div class="p-4 border-b border-border-main">
				<p class="text-text-main text-sm mb-1">Predmet: <strong>{subject}</strong></p>
				<p class="text-text-2 text-xs mb-3">Opíšte vašu otázku alebo problém:</p>
			</div>
			<div class="flex-1 p-4">
				<form class="flex flex-col gap-4" on:submit|preventDefault={startChat}>
					<textarea 
						class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm resize-none" 
						bind:value={newMessage} 
						placeholder="Opíšte váš problém alebo otázku podrobne..."
						rows="4"
						required
					></textarea>
					<div class="flex gap-2">
						<Button color="secondary" onclick={() => chatStep = 'subject'}>
							Späť
						</Button>
						<Button color="primary" type="submit" disabled={!newMessage.trim()}>
							Začať chat
						</Button>
					</div>
				</form>
			</div>
		{:else if chatStep === 'closed-options'}
			<!-- Closed chat options -->
			<div class="p-4 border-b border-border-main">
				<p class="text-text-main text-sm mb-3">
					{#if closedByClient}
						Váš chat bol ukončený.
					{:else}
						Vaša konverzácia bola ukončená adminom.
					{/if}
				</p>
			</div>
			<div class="flex-1 p-4">
				<div class="flex flex-col gap-4">
					<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
						<div class="text-yellow-800 text-sm font-medium mb-2">Chat ukončený</div>
						<div class="text-yellow-700 text-xs mb-3">Čo by ste chceli robiť ďalej?</div>
					</div>
					
					<Button color="primary" onclick={startNewChat}>
						Začať nový chat
					</Button>
					
					<Button color="secondary" onclick={reopenOldChat}>
						Znovu otvoriť posledný chat
					</Button>
				</div>
			</div>
		{:else if chatStep === 'chat'}
			<!-- Active chat interface -->
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
				
				{#if messages.length === 0}
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
				<form class="flex gap-3 mb-3" on:submit|preventDefault={sendMessage}>
					<input 
						class="flex-1 rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm" 
						bind:value={newMessage} 
						placeholder="Napíšte správu..." 
					/>
					<Button color="primary" type="submit" disabled={!newMessage.trim()}>
						Odoslať
					</Button>
				</form>
				
				<!-- Close chat button -->
				<div class="flex justify-center">
					<Button color="warning" onclick={closeChat}>
						<Icon scale="small">
							<Cross />
						</Icon>
						Ukončiť chat
					</Button>
				</div>
			</div>
		{/if}
	</div>
</Dialog>
