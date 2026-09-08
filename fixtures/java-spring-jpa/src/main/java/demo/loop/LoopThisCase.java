package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-this — POSITIVE. this-qualified repository field receiver inside a loop. */
@Service
public class LoopThisCase {

    private final LoopThisOrderRepository orderRepository;

    public LoopThisCase(LoopThisOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void restock(List<LoopThisOrder> orders) {
        for (LoopThisOrder order : orders) {
            this.orderRepository.save(order);
        }
    }
}

interface LoopThisOrderRepository extends JpaRepository<LoopThisOrder, Long> {
}

class LoopThisOrder {
}
