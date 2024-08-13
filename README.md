# Lambda IC Proposal Notifier

Tool to easily and cheaply track proposals and notify to an email group, like Google Groups, of a new proposal.
The followed topics can be set on config.

## Getting Started

Clone, then do "npm install".

If you want to run the lambda:

- in index.mjs make sure you call `handler();`
- then run it: `node src/index.mjs`

## Requirements

It requires you to create an AWS Secrets, and a AWS Parameter Store.

Pretty much, the lambda is checking the open proposals, and if open, stores the new ids on the Parameter Store.
Then with the mail credentials on AWS Secrets, sends email notification.
