---
tags: [skill-creator]
max_turns: 150
timeout_seconds: 3600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

i need a web app for our community makerspace. its for a course im taking and it gets marked against the list below. i dont know how to code at all.

the idea: members book time on our machines (laser cutter, two 3d printers, a cnc router). each machine has a few slots per day. staff approve new members and can see everything, members only see their own bookings.

rules we have: a member can have at most 2 upcoming bookings. a new member has to be approved by staff before they can book anything. the laser cutter needs a safety induction first, staff tick that off per member. and two people must never get the same slot.

can you build it?

M01 Complete functional system: 3 interconnected modules, end-to-end workflow
M02 Database: CRUD, persistence, data relationships
M03 Authentication and authorization: secure login, roles, session protection
M04 Complex business logic: rules, multi-condition workflows
M05 Dynamic data: search, filter, sort, calculations
M06 Error and edge cases: validation, duplicate actions, failure recovery
M07 Responsive UI and accessibility
M08 Live deployment and documentation

and two of the advanced ones:
A03 Advanced security and access control. Test: a user tries to modify another user's restricted record.
A05 Concurrency and transactions. Test: multiple users request the last available resource.
