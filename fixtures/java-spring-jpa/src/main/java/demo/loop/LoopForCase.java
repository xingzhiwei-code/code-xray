package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-for — POSITIVE. Repository write inside an enhanced for loop. */
@Service
public class LoopForCase {

    private final LoopForOrderRepository orderRepository;

    public LoopForCase(LoopForOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void restock(List<LoopForOrder> orders) {
        for (LoopForOrder order : orders) {
            orderRepository.save(order);
        }
    }
}

interface LoopForOrderRepository extends JpaRepository<LoopForOrder, Long> {
}

class LoopForOrder {
}
