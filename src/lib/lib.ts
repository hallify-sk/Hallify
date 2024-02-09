export const serializeNonPOJOs = (obj: unknown) => {
    return JSON.parse(JSON.stringify(obj));
};

export function isToday(date: Date) {
    const today = new Date();
  
    // 👇️ Today's date
    console.log(today);
  
    if (today.toDateString() === date.toDateString()) {
      return true;
    }
  
    return false;
}
export function getMonthName(date: Date){
    const month = date.toLocaleString('sk', { month: 'long' });
    return month;
}
export function getNumberOfDaysInMonth(y: number, m: number){
  return new Date(y, m, 0).getDate();
}