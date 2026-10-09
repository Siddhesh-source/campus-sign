# Open questions for institutional and legal review

**Status:** prepared by the engineering team for VIT Pune's legal, data-protection, and academic-records owners. These are **questions, not legal advice**. Statutes and rules referenced here should be checked against their current text, because several Indian instruments in this area have changed recently.

## Product facts the reviewers need

- **Who uses it:** students, faculty, and administrators sign in with institutional Google accounts (`@vit.edu`).
- **What's stored** (Postgres plus private file storage, hosted by VIT or its vendor):
  - name and email
  - class membership
  - PDFs students upload, which may contain any personal data the forms ask for
  - faculty decisions and the reasons given for rejections
  - an audit log with IP addresses and browser user-agents
- **Signatures:** faculty approvals are signed with **Ed25519 keys generated and held by CampusSign**, encrypted at rest. These are **not** certificates from a licensed Certifying Authority, and not Aadhaar eSign.
- **Blockchain:** a permissioned Hyperledger Fabric network records SHA-256 hashes, opaque document and version ids, event types, signing-key ids, and timestamps. It holds no names, emails, PRNs, titles, comments, or files. Ledger records are append-only by design.
- **Public verification:** `/verify` lets anyone check a PDF's hash. It reveals the signer's name, the class name, the document type, and timestamps, but not the student.

## A. Digital Personal Data Protection (DPDP Act, 2023, and DPDP Rules)

1. **Lawful basis:** do we rely on consent, or on a "legitimate use" such as the employment/education exceptions, for each processing purpose: sign-in, class enrollment, document review, the audit log, and public verification? What notice must be shown, in which languages, and where?
2. **Children's data:** some first-year students may be **under 18**. Does the Act's verifiable parental consent requirement apply to them, and how do we identify minors without collecting date of birth? Do the restrictions on tracking and behavioural monitoring affect the audit log?
3. **Data fiduciary and processor:** is VIT the Data Fiduciary and the hosting provider a Processor? Do we need a processing agreement? Could VIT be notified as a **Significant Data Fiduciary**, and if so, what DPIA or audit duties follow?
4. **Retention and erasure:**
   - How long must submitted documents, signed PDFs, rejection reasons, and audit logs be kept, given the academic-record retention rules in question F?
   - How do we honour erasure requests against records that must be retained, and against **append-only stores**: the audit log, signature records, and ledger events?
5. **Hashes on an immutable ledger:** is a SHA-256 hash of a student's document, plus an opaque document id, "personal data"? If it is, what does erasure mean for a permissioned ledger we can't rewrite? Is crypto-shredding the off-chain mapping enough?
6. **Public verification:** is disclosing the signer's (faculty) name, the class, and the document type to anyone holding the file acceptable? Should faculty consent to this, or should the name be hidden?
7. **Breach notification:** what are our timelines and channels for notifying the Data Protection Board and affected people? Who is the responsible officer?
8. **Cross-border transfer and hosting:** may data or ledger nodes be hosted outside India? Are there sector or state requirements for keeping data in India?
9. **Data principal rights:** what's the process for access, correction, and grievance redressal, and who handles it?

## B. Electronic signatures (Information Technology Act, 2000)

10. **Legal weight:** does a CampusSign approval count as an "electronic signature" or "digital signature" under the IT Act? Our scheme isn't a technique listed in the Act's Second Schedule. For which document types is a **non-certified** electronic authentication acceptable for internal academic processes, and which need a DSC from a licensed CA or Aadhaar eSign?
11. **Excluded documents:** does any form we plan to support fall under the Act's exclusions, or under rules that require handwritten signatures or stamps? Examples include affidavits, powers of attorney, and anything going to external authorities such as embassies, banks, or other universities.
12. **Faculty authority:** what written policy makes a faculty approval in CampusSign an act of VIT? Should faculty accept terms of use for their signing key: custody, rotation, and their duties if it's compromised?
13. **Revocation:** if a key is revoked after compromise, every document it signed **fails verification**. Is that the policy we want, or should signatures made before a stated compromise time stay valid?

## C. Evidence (Bharatiya Sakshya Adhiniyam, 2023, which replaced the Indian Evidence Act)

14. **Certificates:** if a CampusSign record is produced in a dispute, what certificate is needed for electronic records, who signs it, and what system description should we keep on file?
15. **Blockchain evidence:** is the Fabric record useful as corroborating evidence, and how should the network's operation be documented: participants, node operators, and time sources?

## D. CERT-In directions (2022) and security operations

16. **Incident reporting:** do CERT-In's cyber-incident reporting directions (short reporting deadlines, the categories of incidents) apply to VIT for this system? Who reports?
17. **Log retention:** the directions require certain logs to be kept, and maintained in India, for a set period. Do our audit log and server logs meet that, and are we keeping more than we need?
18. **Time sync:** must our servers and ledger nodes sync to the time sources the directions specify?

## E. Institutional policy

19. **Approval routes:** who owns the approval routes for each document type, and who may change them? Is there a change-approval process?
20. **Faculty departure:** when faculty leave, should their past signatures keep verifying (rotate, don't revoke) or not?
21. **Account eligibility:** who decides which accounts count as faculty, and how are visiting faculty handled?
22. **Terms of use:** do students need to accept terms for uploads, covering acceptable content, accuracy, and consequences of forgery?

## F. Records retention (UGC and university rules)

23. **Retention periods:** what are the mandated periods for academic records, and do they cover these documents (lab reports, NOCs, leave applications, bonafide requests)?
24. **Disposal:** at the end of retention, must records be destroyed, and how do we prove it?

## What engineering needs back

For each question, we need: the decision, who made it, any user-facing text required (notices, consents), and which document types it covers. Decisions that change behaviour will be tracked in `TODOS.md` and the phase plans.
