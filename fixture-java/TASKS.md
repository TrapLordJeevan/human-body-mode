# Candidate tasks

Implement all three while preserving existing behaviour:

1. Add case-insensitive search by title and author to `Catalog`, returning matches in insertion order.
2. Make `CsvImporter` accept quoted commas and reject unclosed quotes with a line-numbered error.
3. Add a `RecommendationService.recommendAffordable` method that returns up to `limit` in-stock books, sorted by price then title, without exposing mutable collections.

Add tests to `BookshopTests`. Do not add dependencies.
