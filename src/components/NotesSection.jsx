import NoteCard from './NoteCard'

function DateGroup({ label, children }) {
  return (
    <div className="mb-[26px]">
      <div className="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-hark-muted mb-2 flex items-center gap-[10px] after:content-[''] after:flex-1 after:h-px after:bg-hark-border-light">
        {label}
      </div>
      {children}
    </div>
  )
}

export default function NotesSection() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Notes</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Everything Hark has captured, confirmed and saved.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto">
        <div className="max-w-[600px]">

          <DateGroup label="Today · April 25">
            <NoteCard type="event" title="Mike's birthday party — Saturday May 3rd, 9pm, rooftop on Queen St" time="10:14 am" sub="Added to Calendar" />
            <NoteCard type="task"  title="Submit the Q2 report before end of day Friday"                       time="9:48 am"  sub="Added to Reminders" />
            <NoteCard type="note"  title="Sarah is allergic to shellfish — don't forget when booking restaurants" time="9:22 am"  sub="Saved to Notes" />
          </DateGroup>

          <DateGroup label="Yesterday · April 24">
            <NoteCard type="event" title="Dentist appointment — Thursday May 8th, 3pm, Dr. Patel's office" time="4:51 pm"  sub="Added to Calendar" />
            <NoteCard type="task"  title="Email Tom the updated contract draft"                              time="2:17 pm"  sub="Added to Reminders" />
            <NoteCard type="note"  title="Jake's new job starts May 12th at Shopify — send a message"       time="12:03 pm" sub="Saved to Notes" />
          </DateGroup>

          <DateGroup label="April 23">
            <NoteCard type="task" title="Pick up dry cleaning before Saturday" time="6:30 pm" sub="Added to Reminders" />
          </DateGroup>

        </div>
      </div>
    </div>
  )
}
