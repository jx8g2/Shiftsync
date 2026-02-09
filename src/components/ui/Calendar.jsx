import { useState } from 'react';
import { DAYS_OF_WEEK, DAY_LABELS, addDays, formatDate } from '../../utils/constants';
import './Calendar.css';

function Calendar({
    weekStart,
    onWeekChange,
    events = [],
    onEventClick,
    renderEvent,
    emptyMessage = 'No events'
}) {
    const weekDays = DAYS_OF_WEEK.map((day, index) => ({
        name: day,
        label: DAY_LABELS[day],
        date: addDays(weekStart, index)
    }));

    const handlePrevWeek = () => {
        onWeekChange?.(addDays(weekStart, -7));
    };

    const handleNextWeek = () => {
        onWeekChange?.(addDays(weekStart, 7));
    };

    const getEventsForDay = (day) => {
        return events.filter(event => event.day === day);
    };

    return (
        <div className="calendar">
            <div className="calendar-header">
                <button className="btn btn-secondary btn-icon" onClick={handlePrevWeek}>
                    ←
                </button>
                <span className="calendar-week-range">
                    {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                </span>
                <button className="btn btn-secondary btn-icon" onClick={handleNextWeek}>
                    →
                </button>
            </div>

            <div className="calendar-grid">
                {weekDays.map(({ name, label, date }) => {
                    const dayEvents = getEventsForDay(name);
                    const isToday = new Date().toISOString().split('T')[0] === date;

                    return (
                        <div key={name} className={`calendar-day ${isToday ? 'today' : ''}`}>
                            <div className="calendar-day-header">
                                <span className="day-label">{label}</span>
                                <span className="day-date">{new Date(date).getDate()}</span>
                            </div>
                            <div className="calendar-day-events">
                                {dayEvents.length === 0 ? (
                                    <div className="empty-day">-</div>
                                ) : (
                                    dayEvents.map((event, index) => (
                                        <div
                                            key={index}
                                            className="calendar-event"
                                            onClick={() => onEventClick?.(event)}
                                        >
                                            {renderEvent ? renderEvent(event) : (
                                                <span>{event.title || `${event.start} - ${event.end}`}</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default Calendar;
