<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { page } from '$app/stores';
import Button from './Button.svelte';
import Dialog from './Dialog.svelte';
import Chat from '$lib/icons/Chat.svelte';
import Cross from '$lib/icons/Cross.svelte';
import Check from '$lib/icons/Check.svelte';
import ArrowRight from '$lib/icons/ArrowRight.svelte';
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

function handleProceedToMessage(e: Event) {
	e.preventDefault();
	proceedToMessage();
}

function handleStartChat(e: Event) {
	e.preventDefault();
	startChat();
}

function handleSendMessage(e: Event) {
	e.preventDefault();
	sendMessage();
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
	<button
		class="group bg-primary hover:bg-primary-2 text-white px-6 py-4 rounded border border-primary-4/30 shadow-lg hover:shadow-xl transition-all duration-150 transform hover:scale-105 flex items-center gap-3"
		onclick={() => { 
			open = true; 
			if (sessionId && chatStep === 'chat') {
				startPolling(); 
			}
		}}
	>
		<div class="relative">
			<Icon scale="small">
				<Chat />
			</Icon>
			{#if messages.some(m => m.senderType === 'admin' && !m.isRead)}
				<div class="absolute -top-1 -right-1 w-3 h-3 bg-danger rounded-full animate-pulse"></div>
			{/if}
		</div>
		<span class="font-medium">Napíšte nám</span>
	</button>
</div>

<Dialog bind:open>
	{#snippet header()}
		<div class="flex items-center gap-2">
			<Icon scale="small">
				<Chat />
			</Icon>
			<p class="text-text-main">Chat podpora</p>
		</div>
	{/snippet}
	
	<div class="flex flex-col h-[600px] bg-background-1 rounded border border-border-main/30 overflow-hidden">
		{#if chatStep === 'subject'}
			<!-- Subject input step -->
			<div class="p-6 bg-background-2 border-b border-border-main/30">
				<div class="flex items-start gap-3">
					<div class="w-8 h-8 bg-primary-1 rounded border border-primary-2/30 flex items-center justify-center flex-shrink-0 mt-1">
						<Icon scale="small">
							<Chat />
						</Icon>
					</div>
					<div>
						<h4 class="font-medium text-text-main mb-1">Vitajte v našej podpore!</h4>
						<p class="text-text-2 text-sm">Aký je predmet vašej otázky?</p>
					</div>
				</div>
			</div>
			<div class="flex-1 p-6">
				<form class="space-y-4" onsubmit={handleProceedToMessage}>
					<div>
						<label for="subject-input" class="block text-sm font-medium text-text-main mb-2">Predmet</label>
						<input 
							id="subject-input"
							type="text"
							class="w-full rounded border border-border-main/30 px-4 py-3 bg-background-1 text-text-main text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-150" 
							bind:value={subject} 
							placeholder="napr. Technická podpora, Otázka k objednávke..."
							required
						/>
					</div>
					<Button color="primary" type="submit" disabled={!subject.trim()}>
						<span class="font-medium">Pokračovať</span>
					</Button>
				</form>
			</div>
		{:else if chatStep === 'message'}
			<!-- Message input step -->
			<div class="p-6 bg-background-2 border-b border-border-main/30">
				<div class="flex items-start gap-3">
					<div class="w-8 h-8 bg-success-1 rounded border border-success-2/30 flex items-center justify-center flex-shrink-0">
						<Icon scale="small">
							<Check />
						</Icon>
					</div>
					<div>
						<h4 class="font-medium text-text-main mb-1">Predmet: <span class="text-primary">{subject}</span></h4>
						<p class="text-text-2 text-sm">Teraz opíšte vašu otázku alebo problém:</p>
					</div>
				</div>
			</div>
			<div class="flex-1 p-6">
				<form class="space-y-4" onsubmit={handleStartChat}>
					<div>
						<label for="message-input" class="block text-sm font-medium text-text-main mb-2">Vaša správa</label>
						<textarea 
							id="message-input"
							class="w-full rounded border border-border-main/30 px-4 py-3 bg-background-1 text-text-main text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-150 resize-none" 
							bind:value={newMessage} 
							placeholder="Opíšte váš problém alebo otázku podrobne..."
							rows="5"
							required
						></textarea>
					</div>
					<div class="flex gap-3">
						<Button color="secondary" onclick={() => chatStep = 'subject'}>
							Späť
						</Button>
						<Button color="primary" type="submit" disabled={!newMessage.trim()}>
							<span class="font-medium">Začať chat</span>
						</Button>
					</div>
				</form>
			</div>
		{:else if chatStep === 'closed-options'}
			<!-- Closed chat options -->
			<div class="p-6 bg-warning-1 border-b border-warning-2/30">
				<div class="flex items-start gap-3">
					<div class="w-8 h-8 bg-warning-2 rounded border border-warning-4/30 flex items-center justify-center flex-shrink-0">
						<Icon scale="small">
							<Cross />
						</Icon>
					</div>
					<div>
						<h4 class="font-medium text-text-main mb-1">Chat ukončený</h4>
						<p class="text-text-2 text-sm">
							{#if closedByClient}
								Váš chat bol úspešne ukončený.
							{:else}
								Vaša konverzácia bola ukončená adminom.
							{/if}
						</p>
					</div>
				</div>
			</div>
			<div class="flex-1 p-6">
				<div class="space-y-4">
					<div class="bg-primary-1 border border-primary-2/30 rounded p-4">
						<div class="text-text-main text-sm font-medium mb-2">Čo by ste chceli robiť ďalej?</div>
						<div class="text-text-2 text-xs">Môžete začať novú konverzáciu alebo pokračovať v predchádzajúcej.</div>
					</div>
					
					<div class="space-y-3">
						<Button color="primary" onclick={startNewChat}>
							<span class="font-medium">Začať nový chat</span>
						</Button>
						
						<Button color="secondary" onclick={reopenOldChat}>
							Znovu otvoriť posledný chat
						</Button>
					</div>
				</div>
			</div>
		{:else if chatStep === 'chat'}
			<!-- Active chat interface -->
			<div class="flex-1 overflow-y-auto bg-background-2">
				<!-- Chat messages -->
				<div class="p-4 space-y-4">
					{#each messages as msg}
						<div class="flex {msg.senderType === 'guest' || msg.senderType === 'user' ? 'justify-end' : 'justify-start'}">
							<div class="flex flex-col">
								<!-- Message Bubble -->
								<div class="px-4 py-3 rounded text-sm border {
									msg.senderType === 'guest' || msg.senderType === 'user'
										? 'bg-primary text-white border-primary-4/30 rounded-br-sm' 
										: msg.senderType === 'admin'
										? 'bg-background-1 text-text-main border-border-main/30 rounded-bl-sm'
										: 'bg-background-4 text-text-main border-border-main/30 rounded-bl-sm'
								}">
									<div class="whitespace-pre-wrap leading-relaxed">{msg.message}</div>
								</div>
								
								<!-- Message Meta with Author Info -->
								<div class="flex items-center gap-2 mt-1 px-2 {msg.senderType === 'guest' || msg.senderType === 'user' ? 'justify-end' : 'justify-start'}">
									{#if msg.senderType === 'admin'}
										<div class="flex items-center gap-1">
											<div class="w-2 h-2 bg-success rounded-full"></div>
											<span class="text-xs text-primary font-medium">ADMIN</span>
											{#if msg.senderFirstName && msg.senderLastName}
												<span class="text-xs text-text-1">•</span>
												<span class="text-xs text-text-2">{msg.senderFirstName} {msg.senderLastName}</span>
											{/if}
										</div>
									{:else}
										<span class="text-xs text-text-1">Vy</span>
									{/if}
									<span class="text-xs text-text-1">•</span>
									<span class="text-xs text-text-1">{formatTime(msg.createdAt)}</span>
								</div>
							</div>
						</div>
					{/each}
					
					{#if messages.length === 0}
						<div class="text-center py-12">
							<div class="w-16 h-16 bg-primary-1 rounded border border-primary-2/30 flex items-center justify-center mx-auto mb-4">
								<Icon scale="big">
									<Chat />
								</Icon>
							</div>
							<h4 class="font-medium text-text-main mb-2">Začnite konverzáciu</h4>
							<p class="text-text-2 text-sm">Odošlite správu a naši operátori vám čoskoro odpovedia!</p>
						</div>
					{:else if messages.length > 0 && !messages.some(m => m.senderType === 'admin')}
						<div class="bg-primary-1 border border-primary-2/30 rounded p-4 mx-4">
							<div class="flex items-center gap-3">
								<div class="flex space-x-1">
									<div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
									<div class="w-2 h-2 bg-primary rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
									<div class="w-2 h-2 bg-primary rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
								</div>
								<p class="text-text-main text-sm font-medium">Admin vám čoskoro odpovie...</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Message input area -->
			<div class="bg-background-1 border-t border-border-main/30 p-4">
				<form class="flex gap-3 mb-4" onsubmit={handleSendMessage}>
					<div class="flex-1 relative">
						<input 
							class="w-full rounded border border-border-main/30 px-4 py-3 bg-background-2 text-text-main text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-150 pr-12" 
							bind:value={newMessage} 
							placeholder="Napíšte správu..." 
						/>
						<button
							type="submit"
							disabled={!newMessage.trim()}
							class="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-primary hover:bg-primary-2 disabled:bg-text-1 text-white rounded border border-primary-4/30 flex items-center justify-center transition-colors duration-150"
						>
							<Icon scale="small">
								<ArrowRight />
							</Icon>
						</button>
					</div>
				</form>
				
				<!-- Close chat button -->
				<div class="flex justify-center">
					<button
						onclick={closeChat}
						class="flex items-center gap-2 px-4 py-2 text-danger hover:text-danger-2 hover:bg-danger-1 rounded border border-transparent hover:border-danger-2/30 transition-all duration-150 text-sm"
					>
						<Icon scale="small">
							<Cross />
						</Icon>
						<span>Ukončiť chat</span>
					</button>
				</div>
			</div>
		{/if}
	</div>
</Dialog>
