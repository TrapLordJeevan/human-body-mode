package demo;

import java.util.ArrayList;
import java.util.List;

public final class Catalog {
    private final List<Book> books = new ArrayList<>();

    public void add(Book book) {
        if (books.stream().anyMatch(existing -> existing.isbn().equals(book.isbn()))) {
            throw new IllegalArgumentException("duplicate ISBN: " + book.isbn());
        }
        books.add(book);
    }

    public List<Book> all() {
        return List.copyOf(books);
    }
}
