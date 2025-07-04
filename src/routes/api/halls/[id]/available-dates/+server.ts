import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { events, eventBlocks, halls } from '$lib/server/schema.js';
import { eq, and, gte, lte, or } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params, url }) => {
    const hallId = parseInt(params.id);
    const fromDateParam = url.searchParams.get('from');
    const toDateParam = url.searchParams.get('to');
    
    if (isNaN(hallId)) {
        return json({ error: 'Invalid hall ID' }, { status: 400 });
    }

    // Default date range: from today to 6 months ahead
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sixMonthsAhead = new Date(today);
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

    const fromDate = fromDateParam ? new Date(fromDateParam + 'T00:00:00') : today;
    const toDate = toDateParam ? new Date(toDateParam + 'T00:00:00') : sixMonthsAhead;

    try {
        // Check if hall exists and allows reservations
        const hall = await db.select().from(halls)
            .where(eq(halls.id, hallId))
            .limit(1);
        
        if (hall.length === 0 || !hall[0].allow_reservations) {
            return json({ error: 'Hall not found or reservations not allowed' }, { status: 404 });
        }

        const hallData = hall[0];
        const allowedDays = (hallData.allowedDays as string[]) || ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'];
        const minAdvanceDays = hallData.minAdvanceDays || 0;

        // Calculate minimum date based on advance days requirement
        const minDate = new Date(today);
        minDate.setDate(minDate.getDate() + minAdvanceDays);

        // Get existing events for this hall in the date range
        const existingEvents = await db.select({
            startDate: events.startDate,
            endDate: events.endDate
        }).from(events)
        .where(
            and(
                eq(events.hallId, hallId),
                or(
                    and(
                        gte(events.startDate, fromDate),
                        lte(events.startDate, toDate)
                    ),
                    and(
                        gte(events.endDate, fromDate),
                        lte(events.endDate, toDate)
                    ),
                    and(
                        lte(events.startDate, fromDate),
                        gte(events.endDate, toDate)
                    )
                )
            )
        );

        // Get event blocks for this hall (temporary blocks)
        const blocks = await db.select().from(eventBlocks)
            .where(
                and(
                    eq(eventBlocks.hallId, hallId),
                    eq(eventBlocks.isActive, true),
                    eq(eventBlocks.type, 'temporary'),
                    lte(eventBlocks.startDate, `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`),
                    gte(eventBlocks.endDate, `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`)
                )
            );

        // Get permanent blocks for this hall
        const permanentBlocks = await db.select().from(eventBlocks)
            .where(
                and(
                    eq(eventBlocks.hallId, hallId),
                    eq(eventBlocks.isActive, true),
                    eq(eventBlocks.type, 'permanent')
                )
            );

        // Generate available dates
        const availableDates: string[] = [];
        const unavailableDates: string[] = [];
        
        // Calculate the number of days to iterate
        const startTime = fromDate.getTime();
        const endTime = toDate.getTime();
        const msPerDay = 24 * 60 * 60 * 1000;
        const dayCount = Math.ceil((endTime - startTime) / msPerDay) + 1;
        
        // Map Slovak day abbreviations to database format
        const dayMapping: Record<string, string> = {
            'po': 'pon',    // Monday (pondelok)
            'ut': 'uto',    // Tuesday (utorok)
            'st': 'str',    // Wednesday (streda)
            'št': 'stv',    // Thursday (štvrtok)
            'pi': 'pia',    // Friday (piatok)
            'so': 'sob',    // Saturday (sobota)
            'ne': 'ned'     // Sunday (nedeľa)
        };
        
        for (let i = 0; i < dayCount; i++) {
            // Create a new date for each iteration to avoid timezone drift
            const currentDate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
            
            // Use local date formatting to avoid UTC conversion issues
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const dayOfWeek = currentDate.toLocaleDateString('sk-SK', { weekday: 'short' }).toLowerCase();
            const mappedDay = dayMapping[dayOfWeek] || dayOfWeek;
            
            let isAvailable = true;
            
            // Check if date meets minimum advance days requirement
            if (currentDate < minDate) {
                isAvailable = false;
            }
            
            // First check if this day of week is allowed by the hall
            if (isAvailable && !allowedDays.includes(mappedDay)) {
                isAvailable = false;
            }

            // Check if this day of week is permanently blocked
            if (isAvailable) {
                for (const block of permanentBlocks) {
                    const blockedDays = (block.blockedDays as string[]) || [];
                    if (blockedDays.includes(mappedDay)) {
                        isAvailable = false;
                        break;
                    }
                }
            }
            
            // Check if date conflicts with existing events
            if (isAvailable) {
                for (const event of existingEvents) {
                    const eventStart = new Date(event.startDate + 'T00:00:00');
                    const eventEnd = new Date(event.endDate + 'T00:00:00');
                    
                    if (currentDate >= eventStart && currentDate <= eventEnd) {
                        isAvailable = false;
                        break;
                    }
                }
            }
            
            // Check if date is blocked by temporary blocks
            if (isAvailable) {
                for (const block of blocks) {
                    const blockStart = new Date(block.startDate + 'T00:00:00');
                    const blockEnd = new Date(block.endDate + 'T00:00:00');
                    
                    // Check if current date is within the block's date range
                    if (currentDate >= blockStart && currentDate <= blockEnd) {
                        // Check if this block has specific blocked days
                        const blockedDays = (block.blockedDays as string[]) || [];
                        if (blockedDays.length > 0) {
                            // Only block if current day is in the blocked days list
                            if (blockedDays.includes(mappedDay)) {
                                isAvailable = false;
                                break;
                            }
                        } else {
                            // If no specific days are blocked, block all days in the range
                            isAvailable = false;
                            break;
                        }
                    }
                }
            }
            
            if (isAvailable) {
                availableDates.push(dateStr);
            } else {
                unavailableDates.push(dateStr);
            }
        }

        return json({
            hallId,
            fromDate: fromDate.toISOString().split('T')[0],
            toDate: toDate.toISOString().split('T')[0],
            availableDates,
            unavailableDates
        });
        
    } catch (error) {
        console.error('Error fetching available dates:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
