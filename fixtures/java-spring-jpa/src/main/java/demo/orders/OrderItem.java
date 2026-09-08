package demo.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

/** Demo scenario: order line. */
@Entity
public class OrderItem {

    @Id
    private Long id;

    private int quantity;

    @ManyToOne
    private Order order;

    public int getQuantity() {
        return quantity;
    }
}
