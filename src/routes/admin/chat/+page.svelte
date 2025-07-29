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
	let messagesContainer: HTMLElement;
	let templateDialogOpen = false;
	let newTemplate = { name: '', content: '' };
	let templateSidebarVisible = true;

	// Template responses with variable support
	let templates = [
		{
			id: 1,
			name: 'Uvítanie',
			content: 'Dobrý deň {{name}}, ďakujeme za váš záujem o naše služby. Ako vám môžem pomôcť?'
		},
		{
			id: 2,
			name: 'Žiadosť o informácie',
			content:
				'Ahoj {{name}}, potrebujem od vás ešte niekoľko informácií. Môžete mi prosím poslať viac detailov o {{predmet}}?'
		},
		{
			id: 3,
			name: 'Ukončenie',
			content:
				'Ďakujem {{name}} za váš čas. Ak budete mať ďalšie otázky, neváhajte nás kontaktovať.'
		},
		{
			id: 4,
			name: 'Presmerovanie',
			content:
				'Dobrý deň {{name}}, váš prípad budem musieť presunúť k špecialistovi. Niekto sa vám ozve do 24 hodín.'
		}
	];

	$: sessions = data?.sessions || [];
	$: stats = data?.stats || {
		totalChats: 0,
		newChatsToday: 0,
		newChatsThisWeek: 0,
		closedChatsThisWeek: 0,
		activeChats: 0,
		unreadMessages: 0
	};

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
				messages = data.messages;

				// Auto-scroll on new messages
				if (messages.length > previousMessageCount) {
					setTimeout(() => {
						if (messagesContainer) {
							messagesContainer.scrollTop = messagesContainer.scrollHeight;
						}
					}, 100);
				}
			}
		} catch (error) {
			console.error('Error loading messages:', error);
		}
	}

	function startMessagePolling() {
		// Poll for new messages every 3 seconds
		const messagePolling = setInterval(async () => {
			if (selectedSession) {
				await loadMessages();
			} else {
				clearInterval(messagePolling);
			}
		}, 3000);

		// Clear polling when session changes or component unmounts
		const checkSession = setInterval(() => {
			if (!selectedSession) {
				clearInterval(messagePolling);
				clearInterval(checkSession);
			}
		}, 1000);
	}

	async function sendMessage() {
		if (!selectedSession || !newMessage.trim()) return;

		try {
			const response = await fetch('/api/chat/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: selectedSession.id,
					message: newMessage,
					senderType: 'admin'
				})
			});

			if (response.ok) {
				newMessage = '';
				await loadMessages();
			}

			// Auto-scroll after sending
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
			selectedSession = null;
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
			return `pred ${minutes} min${minutes === 1 ? '' : ''}`;
		}

		// If less than a day ago
		if (diffInSeconds < 86400) {
			const hours = Math.floor(diffInSeconds / 3600);
			return `pred ${hours} h`;
		}

		// If less than a week ago
		if (diffInSeconds < 604800) {
			const days = Math.floor(diffInSeconds / 86400);
			return `pred ${days} dňami`;
		}

		// Otherwise show date
		return date.toLocaleDateString('sk-SK', {
			day: 'numeric',
			month: 'short'
		});
	}

	function formatFullTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('sk-SK', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getDisplayName(session: any) {
		if (session.userEmail) {
			return session.userEmail;
		}
		return `Hosť ${session.guestIdentifier.slice(-6)}`;
	}

	function insertTemplate(template: any) {
		const displayName = getDisplayName(selectedSession);
		let templateContent = template.content;

		// Replace variables
		templateContent = templateContent.replace(/\{\{name\}\}/g, displayName);
		templateContent = templateContent.replace(
			/\{\{email\}\}/g,
			selectedSession.userEmail || 'neuvedený'
		);
		templateContent = templateContent.replace(
			/\{\{predmet\}\}/g,
			selectedSession.subject || 'všeobecná podpora'
		);

		// Add to current message
		if (newMessage.trim()) {
			newMessage += '\n\n' + templateContent;
		} else {
			newMessage = templateContent;
		}
	}

	function deleteTemplate(templateId: number) {
		templates = templates.filter((t) => t.id !== templateId);
	}

	async function createTemplate() {
		if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;

		const id = Math.max(...templates.map((t) => t.id), 0) + 1;
		templates = [...templates, { id, ...newTemplate }];

		// Reset form
		newTemplate = { name: '', content: '' };
		templateDialogOpen = false;
	}

	function getSenderDisplayName(msg: any) {
		if (msg.senderType === 'admin') {
			if (msg.senderFirstName && msg.senderLastName) {
				return `${msg.senderFirstName} ${msg.senderLastName}`;
			}
			return 'Admin';
		} else if (msg.senderType === 'user') {
			return 'Používateľ';
		} else {
			return 'Hosť';
		}
	}
</script>

<svelte:head><title>Chat Management | Hallify Admin</title></svelte:head>
<div class="bg-background-main">
<div class="flex flex-col w-full gap-4 mx-auto max-w-7xl py-6">
	<!-- Header -->
	<div class="flex items-center justify-between w-full">
		<div class="flex items-center gap-4">
			<div>
				<p class="uppercase text-[0.65rem] text-text-1">Chat Support</p>
				<p class="text-text-main">Správa komunikácie s klientmi</p>
			</div>
		</div>
	</div>
	<!-- Statistics Cards -->
	<div class="grid w-full grid-cols-1 gap-4 mx-auto max-w-7xl sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small"><Chat /></Icon>
				<h2 class="text-sm text-text-1">Aktívne chaty</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.activeChats}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small"><Clock /></Icon>
				<h2 class="text-sm text-text-1">Nové dnes</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.newChatsToday}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small"><Users /></Icon>
				<h2 class="text-sm text-text-1">Nové tento týždeň</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.newChatsThisWeek}</p>
		</div>
		<div class="flex flex-col w-full p-4 border border-border-main/30 bg-background-1">
			<div class="flex items-center gap-2 mb-2">
				<Icon scale="small"><CheckCircle /></Icon>
				<h2 class="text-sm text-text-1">Uzavreté tento týždeň</h2>
			</div>
			<p class="text-3xl font-bold text-text-main">{stats.closedChatsThisWeek}</p>
		</div>
	</div>
</div>
<!-- Main Content Area with Two Columns -->
<div class="flex w-full h-[calc(100vh-280px)] mx-auto max-w-7xl gap-4 mt-6">
	<!-- Left Column: Sessions List -->
	<div class="w-1/4 min-w-[320px]">
		<div
			class="relative w-full h-full overflow-hidden border rounded border-border-main/30 bg-background-1"
		>
			<div class="sticky top-0 p-4 border-b border-border-main/30 bg-background-1">
				<h2 class="text-text-main">Aktívne chat konverzácie</h2>
			</div>
			{#if sessions.length === 0}
				<div class="flex items-center justify-center h-32">
					<p class="text-text-1 text-lg">Žiadne aktívne chat konverzácie</p>
				</div>
			{:else}
				<div class="overflow-y-auto h-full">
					{#each sessions as session}
						<div
							class="p-4 border-b border-border-main/30 cursor-pointer hover:bg-background-4 {selectedSession?.id ===
							session.id
								? 'bg-background-4 border-l-4 border-l-primary'
								: ''}"
							on:click={() => selectSession(session)}
							role="button"
							tabindex="0"
							on:keydown={(e) => e.key === 'Enter' && selectSession(session)}
						>
							<div class="flex items-start justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<p class="font-medium text-text-main truncate">{getDisplayName(session)}</p>
										{#if session.unreadCount > 0}
											<span class="bg-danger text-white px-2 py-1 rounded-full text-xs">
												{session.unreadCount}
											</span>
										{/if}
									</div>
									<p class="text-sm text-text-2 truncate">
										{session.subject || 'Všeobecná podpora'}
									</p>
									<div class="flex items-center gap-2 mt-2">
										<span
											class="px-2 py-1 text-xs rounded {session.assignedAdminId
												? 'text-blue-600 bg-blue-300/40'
												: 'text-gray-600 bg-gray-300/40'}"
										>
											{#if session.assignedAdminId}
												Priradené: {session.assignedAdminFirstName} {session.assignedAdminLastName}
											{:else}
												Nepriradené
											{/if}
										</span>
										<span class="text-xs text-text-2">
											{session.lastMessageAt
												? formatTime(session.lastMessageAt.toString())
												: 'Nikdy'}
										</span>
									</div>
								</div>
								<Icon scale="small" class="text-text-2 mt-1">
									<ArrowRight />
								</Icon>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Right Column: Chat Interface -->
	<div class="flex-1">
		{#if selectedSession}
			<div class="flex flex-col h-full bg-background-1 rounded border border-border-main">
				<!-- Session Info Header -->
				<div class="border-b border-border-main/30 p-3 bg-background-2">
					<div class="grid grid-cols-2 gap-3 text-sm">
						<div>
							<p class="text-text-1 text-xs uppercase mb-1">Používateľ</p>
							<p class="text-text-main font-medium">{getDisplayName(selectedSession)}</p>
							{#if selectedSession.userEmail}
								<p class="text-text-1 text-xs">{selectedSession.userEmail}</p>
							{/if}
						</div>
						<div>
							<p class="text-text-1 text-xs uppercase mb-1">Predmet</p>
							<p class="text-text-main font-medium">
								{selectedSession.subject || 'Všeobecná podpora'}
							</p>
						</div>
					</div>

					<!-- Status and Assignment -->
					<div class="flex items-center justify-between mt-2 pt-2 border-t border-border-main/30">
						<div class="flex items-center gap-2 flex-wrap">
							<span
								class="px-2 py-1 text-xs rounded {selectedSession.status === 'active'
									? 'text-green-600 bg-green-300/40'
									: 'text-gray-600 bg-gray-300/40'}"
							>
								{selectedSession.status === 'active' ? 'Aktívne' : 'Uzavreté'}
							</span>
							{#if selectedSession.assignedAdminId}
								<span class="px-2 py-1 text-xs rounded text-blue-600 bg-blue-300/40">
									Priradené: {selectedSession.assignedAdminFirstName} {selectedSession.assignedAdminLastName}
								</span>
							{:else}
								<span class="px-2 py-1 text-xs rounded text-gray-600 bg-gray-300/40">
									Nepriradené
								</span>
							{/if}
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

				<!-- Messages Area with Template Sidebar -->
				<div class="flex-1 flex overflow-hidden">
					<!-- Messages Container -->
					<div class="flex-1 flex flex-col">
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
											<div
												class="px-4 py-3 rounded-lg text-sm {msg.senderType === 'admin'
													? 'bg-primary text-white rounded-br-sm'
													: msg.senderType === 'user'
														? 'bg-secondary text-white rounded-bl-sm'
														: 'bg-background-4 text-text-main border border-border-main rounded-bl-sm'}"
											>
												<div class="whitespace-pre-wrap">{msg.message}</div>
											</div>

											<!-- Message Meta with Author and Admin Badge -->
											<div
												class="flex items-center gap-2 mt-1 px-1 {msg.senderType === 'admin'
													? 'justify-end'
													: 'justify-start'}"
											>
												{#if msg.senderType === 'admin'}
													<span class="text-xs text-blue-600 font-medium">ADMIN</span>
													{#if msg.senderFirstName && msg.senderLastName}
														<span class="text-xs text-text-2">•</span>
														<span class="text-xs text-text-2"
															>{msg.senderFirstName} {msg.senderLastName}</span
														>
													{/if}
												{:else}
													<span class="text-xs text-text-2">
														{msg.senderType === 'user' ? 'Používateľ' : 'Hosť'}
													</span>
												{/if}
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
								<Button
									color="primary"
									onclick={() => (templateSidebarVisible = !templateSidebarVisible)}
								>
									<Icon scale="small">
										<BulletList />
									</Icon>
									{templateSidebarVisible ? 'Skryť šablóny' : 'Zobraziť šablóny'}
								</Button>
							</div>
						</div>
					</div>

					<!-- Template Responses Sidebar -->
					{#if templateSidebarVisible}
						<div class="w-64 border-l border-border-main/30 bg-background-2">
							<div class="p-4 border-b border-border-main/30">
								<div class="flex items-center justify-between">
									<h3 class="text-text-main font-medium">Šablóny odpovedí</h3>
									<Button color="primary" scale="small" onclick={() => (templateDialogOpen = true)}>
										<Icon scale="small">
											<Plus />
										</Icon>
									</Button>
								</div>
							</div>
							<div class="overflow-y-auto h-[calc(100%-60px)]">
								{#if templates.length === 0}
									<div class="p-4 text-center">
										<p class="text-text-2 text-sm">Žiadne šablóny</p>
									</div>
								{:else}
									<div class="space-y-2 p-4">
										{#each templates as template}
											<div class="bg-background-1 border border-border-main/30 rounded p-3">
												<div class="flex items-start justify-between">
													<div class="flex-1 min-w-0">
														<p class="text-sm font-medium text-text-main mb-1">{template.name}</p>
														<p class="text-xs text-text-2 truncate mb-2">{template.content}</p>
														<div class="flex gap-2">
															<Button
																color="secondary"
																scale="small"
																onclick={() => insertTemplate(template)}
															>
																Vložiť
															</Button>
															<Button
																color="danger"
																scale="small"
																onclick={() => deleteTemplate(template.id)}
															>
																<Icon scale="small">
																	<Cross />
																</Icon>
															</Button>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div
				class="flex items-center justify-center h-full bg-background-1 rounded border border-border-main/30"
			>
				<div class="text-center">
					<Icon scale="big" class="mx-auto mb-4 text-text-2">
						<Chat />
					</Icon>
					<p class="text-text-1 text-lg mb-2">Vyberte konverzáciu</p>
					<p class="text-text-2">Kliknite na konverzáciu v ľavom paneli pre začatie chatu</p>
				</div>
			</div>
		{/if}
	</div>
</div></div>
<!-- Template Creation Dialog -->
<Dialog bind:open={templateDialogOpen}>
	{#snippet header()}
		<div class="flex items-center gap-3">
			<Icon scale="small">
				<Plus />
			</Icon>
			<div>
				<p class="font-semibold text-text-main">Vytvoriť novú šablónu</p>
				<p class="text-xs text-text-1">Pridajte novú šablónu odpovede pre rýchlejšiu komunikáciu</p>
			</div>
		</div>
	{/snippet}

	<div class="w-full max-w-md mx-auto">
		<form on:submit|preventDefault={createTemplate}>
			<div class="space-y-4">
				<div>
					<label for="template-name" class="block text-sm font-medium text-text-main mb-2"
						>Názov šablóny</label
					>
					<input
						id="template-name"
						type="text"
						bind:value={newTemplate.name}
						placeholder="napr. Uvítanie nového klienta"
						class="w-full rounded border border-border-main px-3 py-2 bg-background-2 text-text-main text-sm"
						required
					/>
				</div>

				<div>
					<label for="template-content" class="block text-sm font-medium text-text-main mb-2"
						>Obsah šablóny</label
					>
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
			</div>

			<div class="flex justify-between pt-4 border-t border-border-main/30">
				<Button color="secondary" onclick={() => (templateDialogOpen = false)}>
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
