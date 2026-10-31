function u(r,e){if(r==null||r===""||r===0)return"";const t=String(r).trim();if(!/^\d+$/.test(t))return t;const n=Number(e);return Number.isInteger(n)&&n>0?t.padStart(n,"0"):t}export{u as f};
