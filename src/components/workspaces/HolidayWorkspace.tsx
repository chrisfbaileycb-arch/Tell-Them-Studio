import React, { useState } from 'react';
import { HolidayTemplate } from '../../../types';
import { HOLIDAY_TEMPLATES } from '../../../constants';

interface HolidayWorkspaceProps {
  onLoadHolidayTemplate: (tpl: HolidayTemplate) => void;
}

export const HolidayWorkspace: React.FC<HolidayWorkspaceProps> = ({
  onLoadHolidayTemplate,
}) => {
  const [holidayFilter, setHolidayFilter] = useState<
    'All' | 'Halloween (Last-Minute Blitz)' | 'Christmas (Early-Bird Prep)'
  >('All');

  return (
    <section className="space-y-8 mb-14">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900"
            style={{ textWrap: 'balance' }}
          >
            Seasonal Holiday Music & Radio Workshop
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            With mid-October here, wrap up your last-minute Halloween party band tracks and get a head start on Christmas & winter holiday radio singles!
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {(
            [
              'All',
              'Halloween (Last-Minute Blitz)',
              'Christmas (Early-Bird Prep)',
            ] as const
          ).map((filt) => (
            <button
              key={filt}
              onClick={() => setHolidayFilter(filt)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                holidayFilter === filt
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {filt}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {HOLIDAY_TEMPLATES.filter(
          (t) => holidayFilter === 'All' || t.holiday === holidayFilter
        ).map((tpl) => (
          <div
            key={tpl.id}
            className="bg-white rounded-[32px] p-7 card-shadow border border-gray-200/80 flex flex-col justify-between gap-5"
          >
            <div className="flex items-start gap-5">
              <img
                src={tpl.coverSvgUrl}
                alt={tpl.title}
                referrerPolicy="no-referrer"
                className="w-24 h-24 rounded-2xl object-cover shrink-0 border border-gray-200"
              />
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-orange-600">{tpl.holiday}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{tpl.duration}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">{tpl.title}</h3>
                <p className="text-xs text-gray-500">
                  {tpl.bandType} · {tpl.vocalArrangement}
                </p>
                <p className="text-xs text-gray-600 leading-relaxed pt-1">
                  {tpl.prompt}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 text-xs font-mono text-gray-600 whitespace-pre-wrap">
              {tpl.suggestedLyrics}
            </div>

            <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">{tpl.countdownNote}</span>
              <button
                onClick={() => onLoadHolidayTemplate(tpl)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white music-gradient whitespace-nowrap shrink-0"
              >
                Load into Band Studio
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
