export const serializeNonPOJOs = (obj: unknown) => {
    return JSON.parse(JSON.stringify(obj));
};

export function isToday(date: Date) {
    const today = new Date();

    if (today.toDateString() === date.toDateString()) {
      return true;
    }
  
    return false;
}
export function getMonthName(date: Date, format: 'long' | 'short'){
    const month = date.toLocaleString('sk', { month: format });
    return month;
}

export function getMonthNameFromIndex(idx: number, format: 'long' | 'short'){
  const objDate = new Date();
  objDate.setDate(1);
  objDate.setMonth(idx);

  const month = objDate.toLocaleString('sk', { month: format });

  return month;
}

export function getNumberOfDaysInMonth(y: number, m: number){
  return new Date(y, m, 0).getDate();
}

export function dateToInputString(date: Date){

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}