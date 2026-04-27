"use strict";
// Tyypit jaetaan Cloud Functionissa (kopio momentum-next:in keskeisistä rakenteista —
// emme importtaa Next.js-paketista jotta function-build pysyy itsenäisenä).
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectiveStatus = exports.getAssignees = void 0;
const getAssignees = (t) => {
    if (Array.isArray(t.assignees) && t.assignees.length > 0)
        return t.assignees;
    if (t.assignee)
        return [t.assignee];
    return [];
};
exports.getAssignees = getAssignees;
const effectiveStatus = (t) => {
    if (!t.status)
        return 'accepted';
    return t.status;
};
exports.effectiveStatus = effectiveStatus;
