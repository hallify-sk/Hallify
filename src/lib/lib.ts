// Function to serialize non-POJOs (Plain Old JavaScript Objects)
export const serializeNonPOJOs = (obj: unknown) => {
	return JSON.parse(JSON.stringify(obj));
};

// Function to check if a given date is today
export function isToday(date: Date) {
	const today = new Date();
	return today.toDateString() === date.toDateString();
}

// Function to get the name of the month from a date
export function getMonthName(date: Date, format: "long" | "short") {
	return date.toLocaleString("sk", { month: format });
}

// Function to get the name of the month from its index
export function getMonthNameFromIndex(idx: number, format: "long" | "short") {
	const objDate = new Date();
	objDate.setDate(1);
	objDate.setMonth(idx);
	return objDate.toLocaleString("sk", { month: format });
}

// Function to get the number of days in a month
export function getNumberOfDaysInMonth(y: number, m: number) {
	return new Date(y, m, 0).getDate();
}

// Function to convert a date to a string in the format "YYYY-MM-DD"
export function dateToInputString(date: Date) {
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// Function to get the number of minutes from the current time to a given date
export function getMinutesToDate(date: Date | number) {
	return Math.abs(new Date(date).getTime() - Date.now());
}
