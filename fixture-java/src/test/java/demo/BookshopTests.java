package demo;

import java.math.BigDecimal;
import java.util.List;

public final class BookshopTests {
    public static void main(String[] args) {
        validatesBooks();
        rejectsDuplicateIsbn();
        importsAndSortsAvailableBooks();
        System.out.println("BookshopTests: all checks passed");
    }

    private static void validatesBooks() {
        expectThrows(() -> new Book("", "Title", "Author", BigDecimal.ONE, 1));
        expectThrows(() -> new Book("1", "Title", "Author", new BigDecimal("-1"), 1));
    }

    private static void rejectsDuplicateIsbn() {
        Catalog catalog = new Catalog();
        catalog.add(book("1", "B", 1));
        expectThrows(() -> catalog.add(book("1", "A", 1)));
    }

    private static void importsAndSortsAvailableBooks() {
        Catalog catalog = CsvImporter.parse("1,Zebra,Ada,12.50,2\n2,Alpha,Bob,8.00,1\n3,Hidden,Cid,1.00,0\n");
        List<String> titles = new RecommendationService().availableByTitle(catalog).stream().map(Book::title).toList();
        assert titles.equals(List.of("Alpha", "Zebra")) : titles;
        expectThrows(() -> catalog.all().add(book("4", "Mutable", 1)));
    }

    private static Book book(String isbn, String title, int stock) {
        return new Book(isbn, title, "Author", BigDecimal.TEN, stock);
    }

    private static void expectThrows(Runnable action) {
        try {
            action.run();
            throw new AssertionError("expected exception");
        } catch (IllegalArgumentException | UnsupportedOperationException expected) {
        }
    }
}
