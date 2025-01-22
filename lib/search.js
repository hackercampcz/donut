function getTags(year, paid, invoiced, isConfirmed, isVolunteer, isStaff) {
  function tag() {
    if (isStaff && paid) return null;
    if (isStaff) return "staff";
    if (isVolunteer && paid) return null;
    if (isVolunteer) return "volunteer";
    if (paid) return "paid";
    if (invoiced) return "invoiced";
    if (isConfirmed) return "confirmed";
    return "waitingList";
  }
  return [year, tag()].filter(Boolean);
}

export function getRegistrationProjection() {
  return ({
    firstName,
    lastName,
    timestamp,
    invoiced,
    paid,
    firstTime,
    referral,
    ticketType,
    approved,
    ...rest
  }) => {
    const isVolunteer = ticketType === "volunteer";
    const isStaff = ticketType === "staff";
    const isConfirmed = !firstTime || approved || referral;
    return Object.assign(rest, {
      objectID: `${rest.year}-${rest.email}`,
      name: `${firstName} ${lastName}`,
      createdAt: new Date(timestamp).getTime(),
      _tags: getTags(
        rest.year.toString(),
        paid,
        invoiced,
        isConfirmed,
        isVolunteer,
        isStaff,
      ),
    });
  };
}

function getAttendeeTicketTags(ticketType) {
  switch (ticketType) {
    case "nonprofit":
      return [ticketType, "hacker"];
    case "hacker-plus":
      return [ticketType, "hacker"];
    case "hacker-patron":
      return [ticketType, "hacker"];
    default:
      return [ticketType];
  }
}

export function getAttendeesProjection() {
  return ({ paid, housing, travel, ticketType, ...rest }) =>
    Object.assign(rest, {
      objectID: `${rest.year}-${rest.slackID}`,
      createdAt: new Date(paid).getTime(),
      _tags: [rest.year.toString(), travel, housing, ...getAttendeeTicketTags(ticketType)].filter(
        Boolean,
      ),
    });
}
