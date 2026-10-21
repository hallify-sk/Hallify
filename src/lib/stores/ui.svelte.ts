// App-chrome state that pages set and the shell reads.
//
// The floor-plan editor asks for the sidebar as a narrow icon rail while it is
// open, so a 30 m hall gets the width a 240 px menu would otherwise take. The
// rail expands on hover, so nothing in the menu is lost — it is just out of the
// way. Pages set it on mount and clear it when they leave.

let _sidebarRail = $state(false);

export const uiStore = {
	get sidebarRail() {
		return _sidebarRail;
	},
	setSidebarRail(on: boolean) {
		_sidebarRail = on;
	}
};
