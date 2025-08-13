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
	let activeTab: 'active' | 'closed' = 'active';
	let closedSessions: any[] = [];
	let selectedClosedSession: any = null;
	let closedMessages: any[] = [];

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
		loadClosedSessions();
	});

	onDestroy(() => {
		clearInterval(polling);
	});

	async function loadClosedSessions() {
		try {
			const response = await fetch('/api/chat/sessions?status=closed');
			if (response.ok) {
				const data = await response.json();
				closedSessions = data;
			}
		} catch (error) {
			console.error('Error loading closed sessions:', error);
		}
	}

	async function pollSessions() {
		// Poll for new sessions every 5 seconds
		polling = setInterval(async () => {
			try {
				const response = await fetch('/api/chat/sessions');
				if (response.ok) {
					const newSessions = await response.json();
					
					// Preserve existing session data by merging with new data
					const mergedSessions = newSessions.map((newSession: any) => {
						const existingSession = sessions.find((s: any) => s.id === newSession.id);
						if (existingSession) {
							// Preserve important properties that might be lost during polling
							return {
								...newSession,
								// Preserve user data
								userEmail: existingSession.userEmail || newSession.userEmail,
								// Preserve admin assignment data
								assignedAdminId: existingSession.assignedAdminId || newSession.assignedAdminId,
								assignedAdminFirstName: existingSession.assignedAdminFirstName || newSession.assignedAdminFirstName,
								assignedAdminLastName: existingSession.assignedAdminLastName || newSession.assignedAdminLastName
							};
						}
						return newSession;
					});
					
					// If we have a selected session, find and update it from the merged data
					if (selectedSession) {
						const updatedSelectedSession = mergedSessions.find((s: any) => s.id === selectedSession.id);
						if (updatedSelectedSession) {
							selectedSession = updatedSelectedSession;
						}
					}
					
					// Update sessions reactively
					data.sessions = mergedSessions;
				}
			} catch (error) {
				console.error('Error polling sessions:', error);
			}
		}, 5000);
	}

	async function selectSession(session: any) {
		selectedSession = { ...session }; // Create a copy to prevent reference issues
		selectedClosedSession = null; // Clear closed session selection
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

	async function selectClosedSession(session: any) {
		selectedClosedSession = { ...session };
		selectedSession = null; // Clear active session selection
		await loadClosedMessages(session.id);
		
		// Scroll to bottom after loading messages
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 150);
	}

	async function loadClosedMessages(sessionId: string) {
		try {
			const response = await fetch(`/api/chat/messages?sessionId=${sessionId}`);
			if (response.ok) {
				const data = await response.json();
				closedMessages = data.messages;
			}
		} catch (error) {
			console.error('Error loading closed messages:', error);
		}
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
		if (session.userFirstName && session.userLastName) {
			return `${session.userFirstName} ${session.userLastName}`;
		}else if( session.userEmail) {
			return session.userEmail;
		}
		
		return `Hosť ${session.guestIdentifier.slice(-6)}`;
	}

	function getTemplateName(session: any) {
		// For templates, prioritize first/last name over email
		if (session.userFirstName || session.userLastName) {
			const firstName = session.userFirstName || '';
			const lastName = session.userLastName || '';
			return `${firstName} ${lastName}`.trim();
		}
		
		// If no name available but has email, use email
		if (session.userEmail) {
			return session.userEmail;
		}
		
		// For guests, use a friendly guest identifier
		return `Hosť ${session.guestIdentifier.slice(-6)}`;
	}

	function insertTemplate(template: any) {
		const templateName = getTemplateName(selectedSession || selectedClosedSession);
		let templateContent = template.content;

		// Replace variables
		templateContent = templateContent.replace(/\{\{name\}\}/g, templateName);
		templateContent = templateContent.replace(
			/\{\{email\}\}/g,
			(selectedSession || selectedClosedSession).userEmail || 'neuvedený'
		);
		templateContent = templateContent.replace(
			/\{\{predmet\}\}/g,
			(selectedSession || selectedClosedSession).subject || 'všeobecná podpora'
		);

		// Add to current message (only for active sessions)
		if (selectedSession) {
			if (newMessage.trim()) {
				newMessage += '\n\n' + templateContent;
			} else {
				newMessage = templateContent;
			}
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
<div class="w-full min-h-screen px-4 py-6 bg-background-main md:px-24">
<div class="flex flex-col w-full gap-4 mx-auto max-w-7xl">
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
<div class="flex flex-col lg:flex-row w-full h-fit mx-auto max-w-7xl gap-4 mt-6">
	<!-- Left Column: Sessions List -->
	<div class="w-full lg:w-1/4 lg:min-w-[320px] h-64 lg:h-full">
		<div
			class="relative w-full h-full overflow-hidden border rounded border-border-main/30 bg-background-1"
		>
			<!-- Tab Navigation -->
			<div class="sticky top-0 border-b border-border-main/30 bg-background-1">
				<div class="flex">
					<button
						class="flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'active'
							? 'text-primary border-primary bg-background-4'
							: 'text-text-2 border-transparent hover:text-text-main'}"
						on:click={() => (activeTab = 'active')}
					>
						Aktívne ({sessions.length})
					</button>
					<button
						class="flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'closed'
							? 'text-primary border-primary bg-background-4'
							: 'text-text-2 border-transparent hover:text-text-main'}"
						on:click={() => {
							activeTab = 'closed';
							if (closedSessions.length === 0) loadClosedSessions();
						}}
					>
						Uzavreté ({closedSessions.length})
					</button>
				</div>
			</div>

			<!-- Active Sessions -->
			{#if activeTab === 'active'}
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
									<div class="text-text-2 mt-1">
										<Icon scale="small">
											<ArrowRight />
										</Icon>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Closed Sessions -->
			{#if activeTab === 'closed'}
				{#if closedSessions.length === 0}
					<div class="flex items-center justify-center h-32">
						<p class="text-text-1 text-lg">Žiadne uzavreté chat konverzácie</p>
					</div>
				{:else}
					<div class="overflow-y-auto h-full">
						{#each closedSessions as session}
							<div
								class="p-4 border-b border-border-main/30 cursor-pointer hover:bg-background-4 {selectedClosedSession?.id ===
								session.id
									? 'bg-background-4 border-l-4 border-l-primary'
									: ''}"
								on:click={() => selectClosedSession(session)}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && selectClosedSession(session)}
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-1">
											<p class="font-medium text-text-main truncate">{getDisplayName(session)}</p>
											<span class="px-2 py-1 text-xs rounded text-gray-600 bg-gray-300/40">
												Uzavreté
											</span>
										</div>
										<p class="text-sm text-text-2 truncate">
											{session.subject || 'Všeobecná podpora'}
										</p>
										<div class="flex items-center gap-2 mt-2">
											{#if session.assignedAdminId}
												<span class="px-2 py-1 text-xs rounded text-blue-600 bg-blue-300/40">
													{session.assignedAdminFirstName} {session.assignedAdminLastName}
												</span>
											{/if}
											<span class="text-xs text-text-2">
												{session.lastMessageAt
													? formatTime(session.lastMessageAt.toString())
													: 'Nikdy'}
											</span>
										</div>
									</div>
									<div class="text-text-2 mt-1">
										<Icon scale="small">
											<BulletList />
										</Icon>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Right Column: Chat Interface -->
	<div class="flex-1 h-full lg:h-auto max-h-[700px]">
		{#if selectedSession || selectedClosedSession}
			{@const currentSession = selectedSession || selectedClosedSession}
			{@const currentMessages = selectedSession ? messages : closedMessages}
			{@const isActiveSession = !!selectedSession}
			
			<div class="flex flex-col h-full bg-background-1 rounded border border-slate-400/40">
				<!-- Session Info Header -->
				<div class="border-b border-border-main/30 p-3 bg-background-1">
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
						<div>
							<p class="text-text-1 text-xs uppercase mb-1">Používateľ</p>
							<p class="text-text-main font-medium">{getDisplayName(currentSession)}</p>
							{#if currentSession.userEmail}
								<p class="text-text-1 text-xs">{currentSession.userEmail}</p>
							{/if}
						</div>
						<div>
							<p class="text-text-1 text-xs uppercase mb-1">Predmet</p>
							<p class="text-text-main font-medium">
								{currentSession.subject || 'Všeobecná podpora'}
							</p>
						</div>
					</div>

					<!-- Status and Assignment -->
					<div class="flex items-center justify-between mt-2 pt-2 border-t border-border-main/30">
						<div class="flex items-center gap-2 flex-wrap">
							<span
								class="px-2 py-1 text-xs rounded {currentSession.status === 'active'
									? 'text-green-600 bg-green-300/40'
									: 'text-gray-600 bg-gray-300/40'}"
							>
								{currentSession.status === 'active' ? 'Aktívne' : 'Uzavreté'}
							</span>
							{#if currentSession.assignedAdminId}
								<span class="px-2 py-1 text-xs rounded text-blue-600 bg-blue-300/40">
									Priradené: {currentSession.assignedAdminFirstName} {currentSession.assignedAdminLastName}
								</span>
							{:else}
								<span class="px-2 py-1 text-xs rounded text-gray-600 bg-gray-300/40">
									Nepriradené
								</span>
							{/if}
							{#if isActiveSession && selectedSession.unreadCount > 0}
								<span class="bg-danger text-white px-2 py-1 rounded-full text-xs">
									{selectedSession.unreadCount} nových
								</span>
							{/if}
							{#if !isActiveSession}
								<span class="px-2 py-1 text-xs rounded text-orange-600 bg-orange-300/40">
									Transkript
								</span>
							{/if}
						</div>
						{#if isActiveSession && !selectedSession.assignedAdminId}
							<Button color="secondary" onclick={() => assignToMe(selectedSession.id)}>
								Priradiť si
							</Button>
						{/if}
					</div>
				</div>

				<!-- Messages Area -->
				<div class="flex-1 flex overflow-hidden">
					<!-- Messages Container -->
					<div class="flex-1 flex flex-col">
						<div class="flex-1 overflow-y-auto bg-background-2 p-4 space-y-4" bind:this={messagesContainer}>
							{#if currentMessages.length === 0}
								<div class="text-center py-12">
									<div class="w-16 h-16 bg-primary-1 rounded border border-primary-2/30 flex items-center justify-center mx-auto mb-4">
										<Icon scale="big">
											<Chat />
										</Icon>
									</div>
									<h4 class="font-medium text-text-main mb-2">
										{isActiveSession ? 'Zatiaľ žiadne správy' : 'Žiadne správy v tomto transke'}
									</h4>
									<p class="text-text-2 text-sm">
										{isActiveSession ? 'Buďte prvý, kto odpovedá klientovi' : 'Tento chat neobsahuje žiadne správy'}
									</p>
								</div>
							{:else}
								{#if !isActiveSession}
									<div class="bg-background-4 border border-border-main/30 rounded p-3 mb-4">
										<div class="flex items-center gap-2">
											<Icon scale="small">
												<BulletList />
											</Icon>
											<div>
												<p class="text-text-main text-sm font-medium">Transkript uzavretého chatu</p>
												<p class="text-text-2 text-xs">
													Uzavreté: {formatFullTime(currentSession.lastMessageAt)}
												</p>
											</div>
										</div>
									</div>
								{/if}
								
								{#each currentMessages as msg}
									<div class="flex {msg.senderType === 'admin' ? 'justify-end' : 'justify-start'}">
										<div class="flex flex-col">
											<!-- Message Bubble -->
											<div class="px-4 py-3 rounded text-sm border {
												msg.senderType === 'admin'
													? 'bg-primary text-white border-primary-4/30 rounded-br-sm'
													: msg.senderType === 'user'
														? 'bg-background-1 text-text-main border-border-main/30 rounded-bl-sm'
														: 'bg-background-1 text-text-main border-border-main/30 rounded-bl-sm'
											}">
												<div class="whitespace-pre-wrap leading-relaxed">{msg.message}</div>
											</div>

											<!-- Message Meta with Author and Admin Badge -->
											<div class="flex items-center gap-2 mt-1 px-2 {msg.senderType === 'admin' ? 'justify-end' : 'justify-start'}">
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
													<span class="text-xs text-text-1">
														{msg.senderType === 'user' ? 'Používateľ' : 'Hosť'}
													</span>
												{/if}
												<span class="text-xs text-text-1">•</span>
												<span class="text-xs text-text-1">{formatTime(msg.createdAt)}</span>
												{#if msg.senderType !== 'admin' && msg.isRead}
													<span class="text-xs text-text-1">• Prečítané</span>
												{/if}
											</div>
										</div>
									</div>
								{/each}
								
								{#if isActiveSession && messages.length > 0 && !messages.some(m => m.senderType === 'admin')}
									<div class="bg-primary-1 border border-primary-2/30 rounded p-4">
										<div class="flex items-center gap-3">
											<div class="flex space-x-1">
												<div class="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
												<div class="w-2 h-2 bg-primary rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
												<div class="w-2 h-2 bg-primary rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
											</div>
											<p class="text-text-main text-sm font-medium">Čaká na odpoveď od administrátora...</p>
										</div>
									</div>
								{/if}
							{/if}
						</div>

						<!-- Input Area - Only for Active Sessions -->
						{#if isActiveSession}
							<div class="bg-background-1 border-t border-border-main/30 p-4">
								<form class="flex gap-3 mb-4" on:submit|preventDefault={sendMessage}>
									<div class="flex-1 relative">
										<input 
											class="w-full rounded border border-border-main/30 px-4 py-3 bg-background-2 text-text-main text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-150 pr-12" 
											bind:value={newMessage} 
											placeholder="Napíšte odpoveď klientovi..." 
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

								<!-- Action Buttons -->
								<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 pb-4">
									<div class="flex flex-wrap gap-2">
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
						{:else}
							<!-- Read-only footer for closed sessions -->
							<div class="bg-background-4 border-t border-border-main/30 p-4">
								<div class="flex items-center justify-center gap-2">
									<Icon scale="small">
										<CheckCircle />
									</Icon>
									<p class="text-text-2 text-sm">Tento chat je uzavretý - transkript je iba na čítanie</p>
								</div>
							</div>
						{/if}
					</div>

					<!-- Template Responses Sidebar - Only for Active Sessions -->
					{#if isActiveSession && templateSidebarVisible}
						<div class="w-64 lg:w-64 md:w-56 sm:w-48 border-l border-border-main/30 bg-background-2">
							<div class="p-4 border-b border-border-main/30">
								<div class="flex items-center justify-between">
									<h3 class="text-text-main font-medium">Šablóny odpovedí</h3>
									<Button color="primary" onclick={() => (templateDialogOpen = true)}>
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
																onclick={() => insertTemplate(template)}
															>
																Vložiť
															</Button>
															<Button
																color="danger"
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
					<div class="w-16 h-16 bg-primary-1 rounded border border-primary-2/30 flex items-center justify-center mx-auto mb-4">
						<Icon scale="big">
							<Chat />
						</Icon>
					</div>
					<h4 class="font-medium text-text-main mb-2">Vyberte konverzáciu</h4>
					<p class="text-text-2 text-sm">
						{activeTab === 'active' 
							? 'Kliknite na konverzáciu v ľavom paneli pre začatie chatu'
							: 'Kliknite na uzavretý chat pre zobrazenie transkriptu'}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>
</div>
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
						<p>{'{{name}}'} - nahradí sa menom používateľa (meno a priezvisko, alebo email ak nie je meno k dispozícii)</p>
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


