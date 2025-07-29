<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import Button from '$lib/components/Button.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Adjustments from '$lib/icons/Adjustments.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import Chat from '$lib/icons/Chat.svelte';
	import Users from '$lib/icons/Users.svelte';
	import CheckCircle from '$lib/icons/CheckCircle.svelte';
	import Clock from '$lib/icons/Clock.svelte';
	import ArrowRight from '$lib/icons/ArrowRight.svelte';
	import Cross from '$lib/icons/Cross.svelte';
	import User from '$lib/icons/User.svelte';
	import BulletList from '$lib/icons/BulletList.svelte';
	import Plus from '$lib/icons/Plus.svelte';
	
	export let data;
	
	let selectedSession: any = null;
	let messages: any[] = [];
	let newMessage = '';
	let polling: any;
	let sessionDialogOpen = false;
	let messagesContainer: HTMLElement;
	let templateDialogOpen = false;
	let newTemplate = { name: '', content: '' };
	
	// Template responses with variable support
	let templates = [
		{ id: 1, name: 'Uvítanie', content: 'Dobrý deň {{name}}, ďakujeme za váš záujem o naše služby. Ako vám môžem pomôcť?' },
		{ id: 2, name: 'Žiadosť o informácie', content: 'Ahoj {{name}}, potrebujem od vás ešte niekoľko informácií. Môžete mi prosím poslať viac detailov o {{predmet}}?' },
		{ id: 3, name: 'Ukončenie', content: 'Ďakujem {{name}} za váš čas. Ak budete mať ďalšie otázky, neváhajte nás kontaktovať.' },
		{ id: 4, name: 'Presmerovanie', content: 'Dobrý deň {{name}}, váš prípad budem musieť presunúť k špecialistovi. Niekto sa vám ozve do 24 hodín.' }
	];
	
	$: sessions = data.sessions;
	$: stats = data.stats;

	onMount(() => {
		pollSessions();
	});

	onDestroy(() => {
		clearInterval(polling);
	});

	async function pollSessions() {
		// Poll for new sessions every 5 seconds
		polling = setInterval(async () => {
			try {
				const response = await fetch('/api/chat/sessions');
				if (response.ok) {
					const newSessions = await response.json();
					// Update sessions reactively
					data.sessions = newSessions;
				}
			} catch (error) {
				console.error('Error polling sessions:', error);
			}
		}, 5000);
	}

	async function selectSession(session: any) {
		selectedSession = session;
		sessionDialogOpen = true;
		await loadMessages();
		// Mark messages as read when admin opens the chat
		await markMessagesAsRead(session.id);
		startMessagePolling();
		
		// Scroll to bottom after a brief delay
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 150);
	}

	async function markMessagesAsRead(sessionId: string) {
		try {
			await fetch('/api/chat/messages/read', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId })
			});
		} catch (error) {
			console.error('Error marking messages as read:', error);
		}
	}

	async function loadMessages() {
		if (!selectedSession) return;
		
		const previousMessageCount = messages.length;
		
		try {
			const response = await fetch(`/api/chat/messages?sessionId=${selectedSession.id}`);
			if (response.ok) {
				const data = await response.json();
				messages = data.messages || data; // Handle both old and new response formats
				
				// Scroll to bottom if new messages arrived
				if (messages.length > previousMessageCount && messagesContainer) {
					setTimeout(() => {
						messagesContainer.scrollTop = messagesContainer.scrollHeight;
					}, 100);
				}
			}
		} catch (error) {
			console.error('Error loading messages:', error);
		}
	}

	function startMessagePolling() {
		const messagePolling = setInterval(async () => {
			if (!selectedSession) {
				clearInterval(messagePolling);
				return;
			}
			await loadMessages();
		}, 2000);

		// Clear polling when dialog closes
		const checkDialog = setInterval(() => {
			if (!sessionDialogOpen) {
				clearInterval(messagePolling);
				clearInterval(checkDialog);
			}
		}, 1000);
	}

	async function sendMessage() {
		if (!selectedSession || !newMessage.trim()) return;

		try {
			await fetch('/api/chat/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: selectedSession.id,
					message: newMessage,
					senderType: 'admin'
				})
			});
			newMessage = '';
			await loadMessages();
			
			// Scroll to bottom after sending message
			setTimeout(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}, 100);
		} catch (error) {
			console.error('Error sending message:', error);
		}
	}

	async function assignToMe(sessionId: string) {
		try {
			await fetch(`/api/chat/sessions/${sessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId })
			});
			// Refresh sessions
			window.location.reload();
		} catch (error) {
			console.error('Error assigning session:', error);
		}
	}

	async function closeSession(sessionId: string) {
		try {
			await fetch(`/api/chat/sessions/${sessionId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId, status: 'closed' })
			});
			sessionDialogOpen = false;
			window.location.reload();
		} catch (error) {
			console.error('Error closing session:', error);
		}
	}

	function formatTime(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
		
		// If less than a minute ago
		if (diffInSeconds < 60) {
			return 'Práve teraz';
		}
		
		// If less than an hour ago
		if (diffInSeconds < 3600) {
			const minutes = Math.floor(diffInSeconds / 60);
			return `Pred ${minutes} min`;
		}
		
		// If today
		if (date.toDateString() === now.toDateString()) {
			return date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
		}
		
		// If this week
		const daysDiff = Math.floor(diffInSeconds / (24 * 3600));
		if (daysDiff < 7) {
			const days = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
			return days[date.getDay()] + ' ' + date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
		}
		
		// Older than a week
		return date.toLocaleDateString('sk-SK') + ' ' + date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
	}

	function formatFullTime(dateString: string) {
		return new Date(dateString).toLocaleString('sk-SK');
	}

	function getDisplayName(session: any) {
		if (session?.userFirstName && session?.userLastName) {
			return `${session.userFirstName} ${session.userLastName}`;
		} else if (session?.userEmail) {
			return session.userEmail;
		} else {
			return `Guest (${session?.guestIdentifier?.slice(-8) || 'Unknown'})`;
		}
	}

	function getStatusBadge(status: string) {
		switch(status) {
			case 'active':
				return 'text-green-600 bg-green-300/40';
			case 'closed':
				return 'text-gray-600 bg-gray-300/40';
			default:
				return 'text-blue-600 bg-blue-300/40';
		}
	}

	function insertTemplate(template: any) {
		let content = template.content;
		
		// Replace variables with actual values if available
		if (selectedSession?.userName) {
			content = content.replace(/\{\{name\}\}/g, selectedSession.userName);
		}
		if (selectedSession?.email) {
			content = content.replace(/\{\{email\}\}/g, selectedSession.email);
		}
		if (selectedSession?.subject) {
			content = content.replace(/\{\{predmet\}\}/g, selectedSession.subject);
		}
		
		// Insert at cursor position or append
		if (newMessage) {
			newMessage += '\n\n' + content;
		} else {
			newMessage = content;
		}
	}

	function deleteTemplate(templateId: number) {
		templates = templates.filter(t => t.id !== templateId);
	}

	function createTemplate() {
		if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;
		
		const id = Math.max(...templates.map(t => t.id), 0) + 1;
		templates = [...templates, { 
			id, 
			name: newTemplate.name.trim(), 
			content: newTemplate.content.trim() 
		}];
		
		newTemplate = { name: '', content: '' };
		templateDialogOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<svelte:head>
	<title>Chat Support - Admin</title>
</svelte:head>

<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
	<div class="flex flex-row flex-wrap items-center justify-between w-full mx-auto max-w-7xl">
		<div class="flex flex-col flex-nowrap">
			<p class="uppercase text-[0.65rem] text-text-1">Chat Support</p>
			<p class="text-text-main">Správa komunikácie s klientmi</p>
		</div>
	</div>
	
	<!-- Statistics Cards -->
	<div class="grid w-full grid-cols-1 gap-4 mx-auto mt-4 max-w-7xl sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small">
					<Chat />
				</Icon>
				<h2 class="text-sm text-text-1">Aktívne chaty</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.activeChats}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small">
					<Clock />
				</Icon>
				<h2 class="text-sm text-text-1">Nové dnes</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.newChatsToday}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small">
					<Users />
				</Icon>
				<h2 class="text-sm text-text-1">Nové tento týždeň</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.newChatsThisWeek}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small">
					<CheckCircle />
				</Icon>
				<h2 class="text-sm text-text-1">Uzavreté tento týždeň</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.closedChatsThisWeek}</p>
		</div>
	</div>

	<!-- Chat Sessions Table -->
	<div class="flex flex-col items-start w-full gap-4 mx-auto mt-6 max-w-7xl">
		<div class="w-full">
			<div class="relative w-full overflow-y-auto border rounded border-border-main/30 h-96 bg-background-1">
				<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
					<h2 class="text-text-main">Aktívne chat konverzácie</h2>
				</div>
				{#if sessions.length === 0}
					<div class="flex items-center justify-center h-32">
						<p class="text-text-1 text-lg">Žiadne aktívne chat konverzácie</p>
					</div>
				{:else}
					<div class="overflow-y-auto">
						<table class="w-full border-collapse">
							<colgroup>
								<col span="1" style="width: 5%;" />
								<col span="1" style="width: 25%;" />
								<col span="1" style="width: 20%;" />
								<col span="1" style="width: 15%;" />
								<col span="1" style="width: 15%;" />
								<col span="1" style="width: 10%;" />
								<col span="1" style="width: 10%;" />
							</colgroup>
							<thead>
								<tr class="bg-background-2">
									<th></th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Používateľ</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Predmet</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Posledná správa</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Admin</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Nové</th>
									<th class="text-[0.65rem] text-left px-4 py-2 text-text-1 font-normal uppercase">Akcie</th>
								</tr>
							</thead>
							<tbody>
								{#each sessions as session}
									<tr class="chat-table-row">
										<td>
											<button on:click={() => selectSession(session)} class="chat-table-row-modify">
												<Icon scale="small">
													<Chat />
												</Icon>
											</button>
										</td>
										<td class="chat-table-long-text">
											{getDisplayName(session)}
										</td>
										<td class="px-4 py-3 text-sm text-text-4">{session.subject || 'Všeobecná podpora'}</td>
										<td class="px-4 py-3 text-sm text-text-4">
											{session.lastMessageAt ? formatTime(session.lastMessageAt.toString()) : 'Nikdy'}
										</td>
										<td class="px-4 py-3 text-sm text-text-4">
											{#if session.assignedAdminId}
												<span class="px-2 py-1 text-blue-600 rounded bg-blue-300/40">Priradené</span>
											{:else}
												<span class="px-2 py-1 text-gray-600 rounded bg-gray-300/40">Nepriradené</span>
											{/if}
										</td>
										<td class="px-4 py-3 text-sm">
											{#if session.unreadCount > 0}
												<span class="bg-danger text-white px-2 py-1 rounded-full text-xs">
													{session.unreadCount}
												</span>
											{:else}
												<span class="text-text-1">0</span>
											{/if}
										</td>
										<td class="px-4 py-3">
											<div class="flex gap-1">
												<Button color="primary" onclick={() => selectSession(session)}>
													Otvoriť
												</Button>
												{#if !session.assignedAdminId}
													<Button color="secondary" onclick={() => assignToMe(session.id)}>
														Priradiť
													</Button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Chat Dialog -->
<Dialog bind:open={sessionDialogOpen}>
	{#snippet header()}
		<div class="flex items-center justify-between w-full">
			<div class="flex items-center gap-3">
				<Icon scale="small">
					<Chat />
				</Icon>
				<div>
					<p class="font-semibold text-text-main">Chat s {getDisplayName(selectedSession)}</p>
					<p class="text-xs text-text-1">
						{#if selectedSession?.assignedAdminId}
							Priradené vám • 
						{:else}
							Nepriradené • 
						{/if}
						{selectedSession?.status === 'active' ? 'Aktívne' : 'Uzavreté'}
					</p>
				</div>
			</div>
		</div>
	{/snippet}
	
	{#if selectedSession}
		<div class="w-full max-w-6xl mx-auto">
			<div class="flex gap-4 h-[700px]">
				<!-- Main Chat Area -->
				<div class="flex-1 flex flex-col bg-background-1 rounded border border-border-main">
					<!-- Session Info Header -->
					<div class="border-b border-border-main/30 p-4 bg-background-2">
						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p class="text-text-1 text-xs uppercase mb-1">Používateľ</p>
								<p class="text-text-main font-medium">{getDisplayName(selectedSession)}</p>
								{#if selectedSession.userEmail}
									<p class="text-text-1 text-xs">{selectedSession.userEmail}</p>
								{/if}
							</div>
							<div>
								<p class="text-text-1 text-xs uppercase mb-1">Predmet</p>
								<p class="text-text-main font-medium">{selectedSession.subject || 'Všeobecná podpora'}</p>
							</div>
							<div>
								<p class="text-text-1 text-xs uppercase mb-1">Vytvorené</p>
								<p class="text-text-main font-medium">{formatFullTime(selectedSession.createdAt.toString())}</p>
							</div>
							<div>
								<p class="text-text-1 text-xs uppercase mb-1">Posledná aktivita</p>
								<p class="text-text-main font-medium">
									{selectedSession.lastMessageAt ? formatFullTime(selectedSession.lastMessageAt.toString()) : 'Žiadna'}
								</p>
							</div>
						</div>
						
						<!-- Status and Assignment -->
						<div class="flex items-center justify-between mt-3 pt-3 border-t border-border-main/30">
							<div class="flex items-center gap-2">
								<span class="px-2 py-1 text-xs rounded {selectedSession.status === 'active' ? 'text-green-600 bg-green-300/40' : 'text-gray-600 bg-gray-300/40'}">
									{selectedSession.status === 'active' ? 'Aktívne' : 'Uzavreté'}
								</span>
								{#if selectedSession.unreadCount > 0}
									<span class="bg-danger text-white px-2 py-1 rounded-full text-xs">
										{selectedSession.unreadCount} nových
									</span>
								{/if}
							</div>
							{#if !selectedSession.assignedAdminId}
								<Button color="secondary" onclick={() => assignToMe(selectedSession.id)}>
									Priradiť si
								</Button>
							{/if}
						</div>
					</div>

					<!-- Messages Area -->
					<div class="flex-1 overflow-y-auto p-4 space-y-4" bind:this={messagesContainer}>
						{#if messages.length === 0}
							<div class="text-center py-12">
								<Icon scale="big">
									<Chat />
								</Icon>
								<p class="text-text-1 mt-2">Zatiaľ žiadne správy</p>
								<p class="text-text-2 text-sm">Buďte prvý, kto odpovedá klientovi</p>
							</div>
						{:else}
							{#each messages as msg}
								<div class="flex {msg.senderType === 'admin' ? 'justify-end' : 'justify-start'}">
									<div class="flex flex-col max-w-sm">
										<!-- Message Bubble -->
										<div class="px-4 py-3 rounded-lg text-sm {
											msg.senderType === 'admin' 
												? 'bg-primary text-white rounded-br-sm' 
												: msg.senderType === 'user'
												? 'bg-secondary text-white rounded-bl-sm'
												: 'bg-background-4 text-text-main border border-border-main rounded-bl-sm'
										}">
											<div class="whitespace-pre-wrap">{msg.message}</div>
										</div>
										
										<!-- Message Meta -->
										<div class="flex items-center gap-2 mt-1 px-1 {msg.senderType === 'admin' ? 'justify-end' : 'justify-start'}">
											<span class="text-xs text-text-2">
												{msg.senderType === 'admin' ? 'Vy' : msg.senderType === 'user' ? 'Používateľ' : 'Hosť'}
											</span>
											<span class="text-xs text-text-2">•</span>
											<span class="text-xs text-text-2">{formatTime(msg.createdAt)}</span>
											{#if msg.senderType !== 'admin' && msg.isRead}
												<span class="text-xs text-text-2">• Prečítané</span>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						{/if}
					</div>

					<!-- Input Area -->
					<div class="border-t border-border-main/30 bg-background-1">
						<form class="p-4" on:submit|preventDefault={sendMessage}>
							<div class="flex gap-3">
								<textarea 
									class="flex-1 rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm resize-none min-h-[60px] max-h-[120px]" 
									bind:value={newMessage} 
									placeholder="Napíšte odpoveď klientovi..."
									rows="2"
									on:input={(e) => {
										const target = e.target as HTMLTextAreaElement;
										if (target) {
											target.style.height = 'auto';
											target.style.height = Math.min(target.scrollHeight, 120) + 'px';
										}
									}}
									on:keydown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											sendMessage();
										}
									}}
								></textarea>
								<div class="flex flex-col gap-2">
									<Button color="primary" type="submit" disabled={!newMessage.trim()}>
										<Icon scale="small">
											<ArrowRight />
										</Icon>
									</Button>
								</div>
							</div>
						</form>
						
						<!-- Action Buttons -->
						<div class="flex justify-between items-center px-4 pb-4">
							<div class="flex gap-2">
								<Button color="warning" onclick={() => closeSession(selectedSession.id)}>
									<Icon scale="small">
										<Cross />
									</Icon>
									Uzavrieť chat
								</Button>
								{#if !selectedSession.assignedAdminId}
									<Button color="secondary" onclick={() => assignToMe(selectedSession.id)}>
										<Icon scale="small">
											<User />
										</Icon>
										Priradiť si
									</Button>
								{/if}
							</div>
							<div class="text-xs text-text-2">
								{messages.length} správ • Enter = odoslať, Shift+Enter = nový riadok
							</div>
						</div>
					</div>
				</div>

				<!-- Templates Sidebar -->
				<div class="w-80 bg-background-1 rounded border border-border-main flex flex-col">
					<div class="p-4 border-b border-border-main/30 bg-background-2">
						<div class="flex items-center justify-between">
							<h3 class="font-semibold text-text-main">Šablóny odpovedí</h3>
								<Button color="primary" onclick={() => templateDialogOpen = true}>
								<Icon scale="small">
									<Plus />
								</Icon>
							</Button>
						</div>
						<p class="text-xs text-text-1 mt-1">Kliknite na šablónu pre použitie</p>
					</div>
					
					<div class="flex-1 overflow-y-auto p-4 space-y-2">
						{#each templates as template}
							<button 
								class="w-full border border-border-main/30 rounded p-3 hover:bg-background-4 cursor-pointer group text-left" 
								on:click={() => insertTemplate(template)}
							>
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<h4 class="font-medium text-sm text-text-main">{template.name}</h4>
										<p class="text-xs text-text-2 mt-1 line-clamp-2">{template.content}</p>
									</div>
									<span 
										class="opacity-0 group-hover:opacity-100 ml-2 cursor-pointer p-1 hover:bg-red-100 rounded" 
										role="button"
										tabindex="0"
										on:click|stopPropagation={() => deleteTemplate(template.id)}
										on:keydown={(e) => e.key === 'Enter' && deleteTemplate(template.id)}
									>
										<Icon scale="tiny">
											<Cross />
										</Icon>
									</span>
								</div>
							</button>
						{/each}
						
						{#if templates.length === 0}
							<div class="text-center py-8">
								<Icon scale="medium">
									<BulletList />
								</Icon>
								<p class="text-text-1 text-sm mt-2">Žiadne šablóny</p>
								<p class="text-text-2 text-xs">Vytvorte svoju prvú šablónu</p>
							</div>
						{/if}
					</div>
					
					<div class="p-4 border-t border-border-main/30 bg-background-2">
						<div class="text-xs text-text-2">
							<p class="font-medium mb-1">Dostupné premenné:</p>
							<p>{'{{name}}'} - meno používateľa</p>
							<p>{'{{email}}'} - email používateľa</p>
							<p>{'{{predmet}}'} - predmet chatu</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Dialog>

<!-- Template Creation Dialog -->
<Dialog bind:open={templateDialogOpen}>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<Icon scale="small">
				<BulletList />
			</Icon>
			<p class="font-semibold text-text-main">Nová šablóna odpovede</p>
		</div>
	{/snippet}
	
	<div class="w-96">
		<form class="flex flex-col gap-4" on:submit|preventDefault={createTemplate}>
			<div>
				<label for="template-name" class="block text-sm font-medium text-text-main mb-2">Názov šablóny</label>
				<input 
					id="template-name"
					type="text" 
					bind:value={newTemplate.name}
					placeholder="Napríklad: Uvítanie nových klientov"
					class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm"
					required
				/>
			</div>
			
			<div>
				<label for="template-content" class="block text-sm font-medium text-text-main mb-2">Obsah šablóny</label>
				<textarea 
					id="template-content"
					bind:value={newTemplate.content}
					placeholder="Dobrý deň {'{{name}}'}, ďakujeme že ste nás kontaktovali..."
					rows="4"
					class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm resize-none"
					required
				></textarea>
				<div class="mt-2 text-xs text-text-2">
					<p class="font-medium mb-1">Dostupné premenné:</p>
					<p>{'{{name}}'} - nahradí sa menom používateľa</p>
					<p>{'{{email}}'} - nahradí sa emailom používateľa</p>
					<p>{'{{predmet}}'} - nahradí sa predmetom chatu</p>
				</div>
			</div>
			
			<div class="flex justify-between pt-4 border-t border-border-main/30">
				<Button color="secondary" onclick={() => templateDialogOpen = false}>
					<Icon scale="small">
						<Cross />
					</Icon>
					Zrušiť
				</Button>
				<Button color="primary" type="submit">
					<Icon scale="small">
						<Plus />
					</Icon>
					Vytvoriť šablónu
				</Button>
			</div>
		</form>
	</div>
</Dialog>

<style lang="postcss">
	.chat-table-row {
		@apply border-t border-border-main/30 hover:bg-background-4;
	}
	.chat-table-row-modify {
		@apply mx-2 border-border-main/30 border w-8 h-8 flex justify-center text-text-4 items-center rounded duration-150 hover:bg-background-5;
	}
	.chat-table-long-text {
		@apply text-sm px-4 py-3 text-text-4 max-w-40 overflow-ellipsis overflow-hidden whitespace-nowrap text-nowrap h-12;
	}
</style>
