<script lang="ts">
// You can get Calendar In ESM sytle
import { Calendar } from 'headless-calendar';

// Let's create a calendar of Ferbuary of 2024
const february = Calendar.ofMonth(2024, 2, {startWeekdayIndex: 1});

// `february` is an iterable. You can easily get useful info for each day like below:
for (const day of february) {
  console.log(`-------- ${day.day} ${day.monthName()} ${day.year} --------`);
  console.log('Number of day:', day.count);
  console.log('Day number of current month:', day.day);
  console.log('Day number of current month in format:', day.dayInFormat());
  console.log('Current Month number:', day.month);
  console.log('Current year:', day.year);
  console.log('Where the day is in a week:', day.weekdayIndex);
  console.log('Where the day is in terms of passed weeks:', day.weekIndex);
  console.log('Day name:', day.dayName());
  console.log('Current month name:', day.monthName());
  console.log(
    'Is it the first start weekday of current month?',
    day.isFirstStartWeekdayOfMonth
  );
  console.log('JavaScript Date object representing the day:', day.JSDate);

	console.log(Calendar.ofYear(2024))

}
</script>